import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { FargateConstruct } from './fargate';
import { Ec2Construct } from './ec2';
import { Config } from './config';

interface Props extends cdk.StackProps {
  vpc: cdk.aws_ec2.Vpc
  eip: cdk.aws_ec2.CfnEIP
  s3: cdk.aws_s3.Bucket
}
export class FoundryAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

      // VPC padrão
    const vpc = props.vpc;

    // Cluster ECS
    const cluster = new cdk.aws_ecs.Cluster(this, 'EcsCluster', { 
      vpc,
      clusterName: 'FoundryCluster',
     });

    const defaultSecurityGroup = cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(this, 'SecurityGroup', vpc.vpcDefaultSecurityGroup);
    
    // Sistema de Arquivos EFS
    const fileSystem = !!process.env.EFS_ID
      ? cdk.aws_efs.FileSystem.fromFileSystemAttributes(this, 'EfsFileSystem', {
        securityGroup: defaultSecurityGroup,
        fileSystemId: process.env.EFS_ID,
      })
      : new cdk.aws_efs.FileSystem(this, 'EfsFileSystem', {
        vpc,
        performanceMode: cdk.aws_efs.PerformanceMode.GENERAL_PURPOSE,
        throughputMode: cdk.aws_efs.ThroughputMode.BURSTING,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        enableAutomaticBackups: true,
        securityGroup: defaultSecurityGroup
      });

    fileSystem.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['elasticfilesystem:ClientMount'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'elasticfilesystem:AccessedViaMountTarget': 'true'
          }
        }
      })
    )
    if (!!process.env.EFS_ID) {
      props.vpc.selectSubnets({subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED})
        .subnetIds
        .forEach((subnetId, idx) => {
        new cdk.aws_efs.CfnMountTarget(this, `EfsMountTarget-${idx}`, {
          fileSystemId: fileSystem.fileSystemId,
          subnetId: subnetId,
          securityGroups: [vpc.vpcDefaultSecurityGroup]
        })
      })
    }

    const serviceType = this.node.tryGetContext('serviceType') || 'EC2'; // Default para EC

    const serviceConstruct = serviceType === 'EC2'
      ? new Ec2Construct(this, 'Ec2Construct', {eip: props.eip, cluster, vpc, efs: fileSystem})
      : new FargateConstruct(this, 'FargateConstruct', {cluster});
    const { taskDefinition, service } = serviceConstruct;

    // Integração do EFS com a Task Definition
    const volumeName = 'FoundryVolume';
    taskDefinition.addVolume({
      name: volumeName,
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    });

    const curlCommand = !!process.env.SSL_CERTIFICATE_ZIP_URL
      ? `curl -f -k https://localhost:30000 || exit 1`
      : `curl -f http://localhost:30000 || exit 1`;

    // Configuração do contêiner FoundryVTT
    const container = taskDefinition.addContainer('FoundryContainer', {
      memoryLimitMiB: 896,
      image: cdk.aws_ecs.ContainerImage.fromRegistry('felddy/foundryvtt:release-12.331.0'),
      portMappings: [{ containerPort: 30000, protocol: cdk.aws_ecs.Protocol.TCP }], // Porta interna do contêiner
      logging: cdk.aws_ecs.LogDriver.awsLogs({ streamPrefix: 'foundry' }),
      environment: {
        FOUNDRY_RELEASE_URL: process.env.FOUNDRY_RELEASE_URL || '',
        FOUNDRY_USERNAME: process.env.FOUNDRY_USERNAME || '',
        FOUNDRY_PASSWORD: process.env.FOUNDRY_PASSWORD || '',
        CONTAINER_PRESERVE_CONFIG: 'true',
        FOUNDRY_ADMIN_KEY: process.env.FOUNDRY_ADMIN_KEY || '',
        TIMEZONE: process.env.TIMEZONE || 'America/Sao_Paulo',
        FOUNDRY_SSL_CERT: process.env.FOUNDRY_SSL_CERT || '',
        FOUNDRY_SSL_KEY: process.env.FOUNDRY_SSL_KEY || '',
        FOUNDRY_AWS_CONFIG: Config.hasS3Options() ? Config.containerS3OptionsPath() : '',
      },
      healthCheck: {
        command: ['CMD-SHELL', curlCommand],
        retries: 5,
        startPeriod: cdk.Duration.seconds(35),
      }
    });

    container.addPortMappings({ containerPort: 30000, protocol: cdk.aws_ecs.Protocol.TCP, hostPort: 80 });
    if (!!process.env.SSL_CERTIFICATE_ZIP_URL) {
      container.addPortMappings({ containerPort: 30000, protocol: cdk.aws_ecs.Protocol.TCP, hostPort: 443 });
    }

    // Montar o volume no contêiner
    container.addMountPoints({
      sourceVolume: volumeName,
      containerPath: '/data',
      readOnly: false,
    });

    // Permissões de rede para o EFS
    fileSystem.connections.allowDefaultPortFrom(service.connections);
    fileSystem.grantRootAccess(service.taskDefinition.taskRole.grantPrincipal);

    // Permissões s3 para o EFS
    props.s3.grantReadWrite(service.taskDefinition.taskRole.grantPrincipal);
  }
}

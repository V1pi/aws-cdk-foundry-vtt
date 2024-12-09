import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { FargateConstruct } from './fargate';
import { Ec2Construct } from './ec2';

export class FoundryAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      // VPC padrão
    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // Cluster ECS
    const cluster = new cdk.aws_ecs.Cluster(this, 'EcsCluster', { 
      vpc,
      clusterName: 'FoundryCluster',
     });

    const serviceType = this.node.tryGetContext('serviceType') || 'EC2'; // Default para EC

    const serviceConstruct = serviceType === 'EC2' ? new Ec2Construct(this, 'Ec2Construct', {cluster, vpc}) : new FargateConstruct(this, 'FargateConstruct', {cluster});
    const { taskDefinition, service } = serviceConstruct;

    // Integração do EFS com a Task Definition
    const volumeName = 'FoundryVolume';
    taskDefinition.addVolume({
      name: volumeName,
      host: {
        sourcePath: '/foundry'
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
  }
}

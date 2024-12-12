import * as cdk from 'aws-cdk-lib';
import { AsgCapacityProvider } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import * as path from 'path';

interface Props {
  cluster: cdk.aws_ecs.Cluster;
  vpc: cdk.aws_ec2.IVpc;
  efs: cdk.aws_efs.IFileSystem;
  eip: cdk.aws_ec2.CfnEIP;
}
export class Ec2Construct extends Construct {
  taskDefinition: cdk.aws_ecs.TaskDefinition;
  service: cdk.aws_ecs.BaseService;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const asg = new cdk.aws_autoscaling.AutoScalingGroup(this, 'AutoScalingGroup', {
      vpc: props.vpc,
      instanceType: new cdk.aws_ec2.InstanceType('t2.micro'),
      machineImage: cdk.aws_ecs.EcsOptimizedImage.amazonLinux2023(),
      maxCapacity: 1,
      ssmSessionPermissions: true,
      signals: cdk.aws_autoscaling.Signals.waitForCount(1),
      userData: cdk.aws_ec2.UserData.forLinux(),
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC
      },
      initOptions: {
        configSets: ['default'],
        printLog: true,
        ignoreFailures: true,
      },
      init: cdk.aws_ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['config']
        },
        configs: {
          config: new cdk.aws_ec2.InitConfig([
            cdk.aws_ec2.InitFile.fromObject('/etc/config.json', {
              IP: props.eip.ref,
              PUBLIC_SSH_KEY: process.env.PUBLIC_SSH_KEY,
              SSL_CERTIFICATE_ZIP_URL: process.env.SSL_CERTIFICATE_ZIP_URL,
              EFS_ID: props.efs.fileSystemId,
            }),
            cdk.aws_ec2.InitFile.fromFileInline('/etc/init.d/config.sh', path.join(__dirname, '..', '..', 'config.sh')),
            cdk.aws_ec2.InitCommand.shellCommand('chmod +x /etc/init.d/config.sh'),
            cdk.aws_ec2.InitCommand.shellCommand('/etc/init.d/config.sh'),
          ])
        }
      })
    });

    // @ts-nocheck
    // @ts-ignore
    const resourceLocator = `--region ${cdk.Stack.of(this).region} --stack ${cdk.Stack.of(this).stackName} --resource ${asg.node.defaultChild!.logicalId!}`
    asg.addUserData('yum install -y aws-cfn-bootstrap',
      `/opt/aws/bin/cfn-init -v ${resourceLocator} -c default`,
      `/opt/aws/bin/cfn-signal -e 0 ${resourceLocator}`,
      'cat /var/log/cfn-init.log >&2');

    asg.grantPrincipal.addToPrincipalPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ssm:StartSession'],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/AWS-StartSSHSession`,
      ],
    }));

    asg.grantPrincipal.addToPrincipalPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ec2:AssociateAddress'],
      resources: [`arn:aws:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`],
    }));

    asg.connections.allowFromAnyIpv4(cdk.aws_ec2.Port.tcp(80));
    if (!!process.env.SSL_CERTIFICATE_ZIP_URL) {
      asg.connections.allowFromAnyIpv4(cdk.aws_ec2.Port.tcp(443));
    }

    // Permissões de rede para o EFS
    props.efs.connections.allowDefaultPortFrom(asg.connections);
    props.efs.grantRootAccess(asg.grantPrincipal);

    props.cluster.addAsgCapacityProvider(new AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: asg
    }))

    this.taskDefinition = new cdk.aws_ecs.Ec2TaskDefinition(this, 'TaskDefinition');
    
    this.service = new cdk.aws_ecs.Ec2Service(this, 'EcsService', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      serviceName: 'EcsFoundryService',
      desiredCount: 1, // Apenas uma tarefa para manter no Free Tier
    });
  }
}
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
        sourcePath: '/data'
      }
    });

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
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:30000 || exit 1'],
        retries: 5,
        startPeriod: cdk.Duration.seconds(35),
      }
    });

    container.addPortMappings({ containerPort: 30000, protocol: cdk.aws_ecs.Protocol.TCP }); // Porta externa do contêiner

    // Montar o volume no contêiner
    container.addMountPoints({
      sourceVolume: volumeName,
      containerPath: '/data',
      readOnly: false,
    });

    // Application Load Balancer
    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc,
      internetFacing: true,
    });

    // Listener para o Load Balancer
    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // Integração do ALB com o Serviço ECS
    listener.addTargets('EcsServiceTarget', {
      port: 30000, // Porta que o ALB redirecionará para o contêiner
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/', // Caminho de verificação de saúde
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200,302',
      },
    });

    // Output do DNS do ALB
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'DNS do ALB para acessar o FoundryVTT',
    });
  }
}

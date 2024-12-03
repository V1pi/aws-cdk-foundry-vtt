import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class FoundryAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

       // VPC padrão
    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // Cluster ECS
    const cluster = new cdk.aws_ecs.Cluster(this, 'EcsCluster', { vpc });

    // Sistema de Arquivos EFS
    const fileSystem = new cdk.aws_efs.FileSystem(this, 'EfsFileSystem', {
      vpc,
      lifecyclePolicy: cdk.aws_efs.LifecyclePolicy.AFTER_7_DAYS, // Mover para armazenamento mais barato após 7 dias
      performanceMode: cdk.aws_efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: cdk.aws_efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Definição de Tarefa (Task Definition) com arquitetura arm64
    const taskDefinition = new cdk.aws_ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: 512, // Compatível com o Free Tier
      cpu: 256, // Compatível com o Free Tier
      runtimePlatform: {
        operatingSystemFamily: cdk.aws_ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: cdk.aws_ecs.CpuArchitecture.ARM64,
      },
    });

    // Integração do EFS com a Task Definition
    const volumeName = 'EfsVolume';
    taskDefinition.addVolume({
      name: volumeName,
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    });

    // Configuração do contêiner FoundryVTT
    const container = taskDefinition.addContainer('FoundryContainer', {
      image: cdk.aws_ecs.ContainerImage.fromRegistry('felddy/foundryvtt:latest'),
      portMappings: [{ containerPort: 30000, protocol: cdk.aws_ecs.Protocol.TCP }], // Porta interna do contêiner
      logging: cdk.aws_ecs.LogDriver.awsLogs({ streamPrefix: 'foundry' }),
      environment: {
        FOUNDRY_RELEASE_URL: process.env.FOUNDRY_RELEASE_URL!,
      }
    });

    container.addPortMappings({ containerPort: 30000, protocol: cdk.aws_ecs.Protocol.TCP }); // Porta externa do contêiner

    // Montar o volume no contêiner
    container.addMountPoints({
      sourceVolume: volumeName,
      containerPath: '/data',
      readOnly: false,
    });

    // Serviço ECS com Fargate
    const service = new cdk.aws_ecs.FargateService(this, 'EcsService', {
      cluster,
      taskDefinition,
      desiredCount: 1, // Apenas uma tarefa para manter no Free Tier
    });

    // Security Group para o Load Balancer
    const albSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Allow HTTP traffic',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80), 'Allow HTTP');

    // Application Load Balancer
    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // Listener para o Load Balancer
    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // Permissões de rede para o EFS
    fileSystem.connections.allowDefaultPortFrom(service.connections);

    // Integração do ALB com o Serviço ECS
    listener.addTargets('EcsServiceTarget', {
      port: 30000, // Porta que o ALB redirecionará para o contêiner
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/', // Caminho de verificação de saúde
      },
    });

    // Output do DNS do ALB
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'DNS do ALB para acessar o FoundryVTT',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface Props {
  cluster: cdk.aws_ecs.Cluster;
}
export class FargateConstruct extends Construct {
  taskDefinition: cdk.aws_ecs.TaskDefinition;
  service: cdk.aws_ecs.BaseService;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.taskDefinition = new cdk.aws_ecs.FargateTaskDefinition(this, 'TaskDefinition', {
        runtimePlatform: {
          operatingSystemFamily: cdk.aws_ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: cdk.aws_ecs.CpuArchitecture.ARM64,
        },
      });
    
    this.service = new cdk.aws_ecs.FargateService(this, 'EcsService', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      serviceName: 'EcsFoundryService',
      desiredCount: 1, // Apenas uma tarefa para manter no Free Tier
    });
  }
}
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface Props {
  cluster: cdk.aws_ecs.Cluster;
  vpc: cdk.aws_ec2.IVpc;
}
export class Ec2Construct extends Construct {
  taskDefinition: cdk.aws_ecs.TaskDefinition;
  service: cdk.aws_ecs.BaseService;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    props.cluster.addCapacity('DefaultCapacity', {
        instanceType: new cdk.aws_ec2.InstanceType('t2.micro'),
        machineImage: cdk.aws_ecs.EcsOptimizedImage.amazonLinux2(),
        maxCapacity: 1,
    })

    this.taskDefinition = new cdk.aws_ecs.Ec2TaskDefinition(this, 'TaskDefinition');
    
    this.service = new cdk.aws_ecs.Ec2Service(this, 'EcsService', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      serviceName: 'EcsFoundryService',
      desiredCount: 1, // Apenas uma tarefa para manter no Free Tier
    });
  }
}
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

    const ebsSnapshotId = process.env.EBS_SNAPSHOT_ID

    const ebs = ebsSnapshotId && ebsSnapshotId.length > 0 ? 
      cdk.aws_autoscaling.BlockDeviceVolume.ebsFromSnapshot(ebsSnapshotId, {
        deleteOnTermination: false,
        volumeSize: 30,
        volumeType: cdk.aws_autoscaling.EbsDeviceVolumeType.GP3
      })
      : cdk.aws_autoscaling.BlockDeviceVolume.ebs(30, {
          deleteOnTermination: false,
          volumeType: cdk.aws_autoscaling.EbsDeviceVolumeType.GP3
      });

    const asg = props.cluster.addCapacity('DefaultCapacity', {
        instanceType: new cdk.aws_ec2.InstanceType('t2.micro'),
        machineImage: cdk.aws_ecs.EcsOptimizedImage.amazonLinux2(),
        maxCapacity: 1,
        ssmSessionPermissions: true,
        blockDevices: [
          {
            deviceName: '/dev/xvda',
            volume: ebs
          }
        ]
    })

    asg.grantPrincipal.addToPrincipalPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ssm:StartSession'],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/AWS-StartSSHSession`,
      ],
    }));

    asg.addUserData(
        'if ! file -s /dev/xvda | grep -q filesystem; then',
        '  mkfs -t ext4 /dev/xvda',
        'fi',
        'mkdir -p /data',
        'mount /dev/xvda /data',
        'echo "/dev/xvda /data ext4 defaults,nofail 0 2" >> /etc/fstab'
    );

    this.taskDefinition = new cdk.aws_ecs.Ec2TaskDefinition(this, 'TaskDefinition');
    
    this.service = new cdk.aws_ecs.Ec2Service(this, 'EcsService', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      serviceName: 'EcsFoundryService',
      desiredCount: 1, // Apenas uma tarefa para manter no Free Tier
    });
  }
}
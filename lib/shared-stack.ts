import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SharedStack extends cdk.Stack {
  vpc: cdk.aws_ec2.Vpc;
  eip: cdk.aws_ec2.CfnEIP;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.eip = new cdk.aws_ec2.CfnEIP(this, 'EC2EIP');

    // Criação da VPC
    this.vpc = new cdk.aws_ec2.Vpc(this, 'FreeTierVPC', {
      restrictDefaultSecurityGroup: false,
      ipAddresses: cdk.aws_ec2.IpAddresses.cidr('10.0.0.0/24'), // Range de IP pequeno para economizar recursos
      maxAzs: 1, // Apenas 1 Zona de Disponibilidade
      subnetConfiguration: [
        {
          cidrMask: 28, // Máscara pequena para limitar o número de IPs
          name: 'PublicSubnet',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 28, // Máscara pequena para limitar o número de IPs
          name: 'IsolatedSubnet',
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED, // Sub-rede isolada sem NAT
        }
      ],
      natGateways: 0, // Não criar NAT Gateway (evitar custos adicionais)
    });

    // Adicionar tags para fins de organização
    cdk.Tags.of(this.vpc).add('Environment', 'FreeTier');

    // Output do ID da VPC
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'ID da VPC criada.',
    });
  }
}

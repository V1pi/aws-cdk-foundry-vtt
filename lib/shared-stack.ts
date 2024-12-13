import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SharedStack extends cdk.Stack {
  vpc: cdk.aws_ec2.Vpc;
  eip: cdk.aws_ec2.CfnEIP;
  s3: cdk.aws_s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.eip = new cdk.aws_ec2.CfnEIP(this, 'EC2EIP');

    this.s3 = new cdk.aws_s3.Bucket(this, 'FreeTierS3', {
      bucketName: 'foundry-assets-v1pi',
      blockPublicAccess: new cdk.aws_s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
        ignorePublicAcls: false
      }),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [cdk.aws_s3.HttpMethods.GET, cdk.aws_s3.HttpMethods.HEAD, cdk.aws_s3.HttpMethods.PUT],
          allowedOrigins: (process.env.ALLOWED_S3_ORIGINS || '*').split(','),
          allowedHeaders: ['*'],
          maxAge: 3000
        }
      ]
    });

    // Adicionando uma política de bucket para permitir o acesso público aos objetos
    this.s3.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${this.s3.bucketArn}/*`], // Aplica-se a todos os objetos dentro do bucket
      effect: cdk.aws_iam.Effect.ALLOW,
      principals: [new cdk.aws_iam.StarPrincipal()], // Permite o acesso público
    }));

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

    this.vpc.addGatewayEndpoint(
      `GatewayEndpointS3`,
      {
        service: cdk.aws_ec2.GatewayVpcEndpointAwsService.S3,
      },
    );

    // Adicionar tags para fins de organização
    cdk.Tags.of(this.vpc).add('Environment', 'FreeTier');

    // Output do ID da VPC
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'ID da VPC criada.',
    });
  }
}

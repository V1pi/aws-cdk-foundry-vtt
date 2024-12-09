# Connect to EC2

Linux:
```
Host i-* mi-*
  IdentityFile ~/.ssh/foundry
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p' --profile personal"
```

Windowns:
```
Host i-* mi-*
  IdentityFile ~/.ssh/foundry
  ProxyCommand C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p --profile personal"
```

Command:
```
ssh ec2-user@<instance-id>
```

## First run command:
The command below must be executed in the EC2 instance in the first connection.
```
sudo setfacl -R -m u:ec2-user:rwx /foundry
```

Copy files:
````
scp ./data.tar ec2-user@<instance-id>:/foundry/
```

```
    const resourceLocator = `--region ${cdk.Stack.of(this).region} --stack ${cdk.Stack.of(this).stackName} --resource ${asg.node.defaultChild!.logicalId!}`

    asg.addUserData('yum install -y aws-cfn-bootstrap',
      `/opt/aws/bin/cfn-init -v ${resourceLocator} -c default`,
      `/opt/aws/bin/cfn-signal -e $? ${resourceLocator} -c default`);
```
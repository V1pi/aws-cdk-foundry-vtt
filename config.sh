#!/bin/bash -xe

echo "Installing jq"

# Install jq
yum install -y jq

# Install acl
yum install -y acl

echo "Loading environment variables from /etc/config.json"
# Load environment variables from /etc/config.json
IP=$(jq -r '.IP' /etc/config.json)
PUBLIC_SSH_KEY=$(jq -r '.PUBLIC_SSH_KEY' /etc/config.json)
SSL_CERTIFICATE_ZIP_URL=$(jq -r '.SSL_CERTIFICATE_ZIP_URL' /etc/config.json)

# Setup SSH authorized keys
echo "Setting up SSH access"
mkdir -p /home/ec2-user/.ssh || true
echo "${PUBLIC_SSH_KEY}" >> /home/ec2-user/.ssh/authorized_keys

# Ensure proper permissions for the SSH directory
chmod 700 /home/ec2-user/.ssh
chmod 600 /home/ec2-user/.ssh/authorized_keys
chown -R ec2-user:ec2-user /home/ec2-user/.ssh

# If SSL_CERTIFICATE_ZIP_URL is defined, download and extract the SSL certificates
if [[ ! -d "/foundry/ssh" ]]; then
    echo "/foundry/ssh does not exist or is empty, proceeding with SSL certificate setup"

    # Create directory for SSL certificates
    echo "Creating directory for SSL certificates"
    mkdir -p /foundry/ssl || true

    if [[ -n "${SSL_CERTIFICATE_ZIP_URL}" ]]; then
        echo "Downloading and setting up SSL certificates"
        yum install -y unzip
        curl -L "${SSL_CERTIFICATE_ZIP_URL}" -o /tmp/ssl.zip
        unzip /tmp/ssl.zip -d /foundry/ssl
        rm /tmp/ssl.zip
        chmod -R 755 /foundry/ssl
    else
        echo "SSL_CERTIFICATE_ZIP_URL not provided, skipping SSL setup"
    fi
else
    echo "/foundry/ssh exists and is not empty, skipping SSL setup"
fi

# Attach the Elastic IP to this EC2 instance
echo "Attaching Elastic IP: ${IP}"
INSTANCE_ID=$(ec2-metadata --instance-id | cut -d " " -f 2)
REGION=$(ec2-metadata --availability-zone | sed 's/placement: \(.*\).$/\1/')

if [[ -n "${IP}" && -n "${INSTANCE_ID}" && -n "${REGION}" ]]; then
    echo "Instance ID: ${INSTANCE_ID}, Region: ${REGION}, IP: ${IP}"
    aws ec2 associate-address --instance-id "${INSTANCE_ID}" --public-ip "${IP}" --region "${REGION}"
else
    echo "Elastic IP or instance metadata not available. Skipping EIP attachment."
fi

setfacl -R -m u:ec2-user:rwx /foundry

# Log completion
echo "Instance initialization script completed"

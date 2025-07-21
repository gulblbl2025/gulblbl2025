docker exec -it <容器名> /bin/sh
# cat /etc/os-release
# apk update
# apk add bash

apk add openssh
ssh-keygen -A
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
echo "Port 2222" >> /etc/ssh/sshd_config
echo "root:yourpassword" | chpasswd
/usr/sbin/sshd -d # 启动 SSHD 时加上调试模式

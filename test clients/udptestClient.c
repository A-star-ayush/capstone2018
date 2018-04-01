#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/types.h>

#define exit_err(msg) \
	do { perror(msg); exit(EXIT_FAILURE); } while(0)

int main(int argc, char const *argv[])
{
	
	struct sockaddr_in add;
	memset(&add, 0, sizeof(struct sockaddr_in));
	add.sin_family = AF_INET;
	add.sin_port = htons(20000);
	add.sin_addr.s_addr = inet_addr("127.0.0.1");

	int fd = socket(PF_INET, SOCK_DGRAM, 0);
	if (fd < 0) exit_err("socket");

	int rt = connect(fd, (struct sockaddr*)&add, sizeof(struct sockaddr_in));
	if (rt < 0) exit_err("connect");

	char reqs[][] = { "MH0001,20180401123400,12.844312,80.152682",
					  "MH0001,20180401124700,12.845312,80.152682",
					  "MH0001,20180401131400,12.854312,80.152682",
					  "MH0001,20180401152400,12.854312,80.152682",
					  "MH0001,20180401183400,12.944312,80.152682",
					  "MH0001,20180402042500,12.945812,81.152682",
					  "MH0001,20180402091800,13.144312,81.152682",
					  "MH0001,20180402185800,13.842312,81.152682",
					  "MH0001,20180402202200,14.843231,81.152682",
					  "MH0001,20180402223400,15.567312,81.152682",
					  "MH0001,20180402233900,15.844891,81.152682", };
		
	int i;
	for (i = 0; i < 10; ++i)
		write(fd, reqs[i], strlen(reqs[i]));
	close(fd);
	
	return 0;
}


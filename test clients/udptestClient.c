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
	add.sin_addr.s_addr = inet_addr("13.127.40.45");

	int fd = socket(PF_INET, SOCK_DGRAM, 0);
	if (fd < 0) exit_err("socket");

	int rt = connect(fd, (struct sockaddr*)&add, sizeof(struct sockaddr_in));
	if (rt < 0) exit_err("connect");

	char reqs[][42] = { "MH0007,20180403173114,12.848392,80.143373",
					    "MH0007,20180403213134,12.849420,80.142166",
					    "MH0007,20180404173155,12.850550,80.140864",
					    "MH0007,20180404203215,12.851859,80.139533",
					    "MH0007,20180405123235,12.852593,80.138911",
					    "MH0007,20180405173256,12.845812,80.152682",
					    "MH0007,20180405213316,12.856560,80.134983",
					    "MH0007,20180406173336,12.857596,80.134017",
					    "MH0007,20180406173357,12.858426,80.133448"
					 };
		
	int i;
	for (i = 0; i < 10; ++i)
		write(fd, reqs[i], strlen(reqs[i]));
	close(fd);
	
	return 0;
}

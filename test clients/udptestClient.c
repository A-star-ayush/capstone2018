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

	char reqs[][42] = { "MH0002,20180401123400,12.848392,80.143373",
					    "MH0002,20180401124700,12.849420,80.142166",
					    "MH0002,20180401131400,12.850550,80.140864",
					    "MH0002,20180401152400,12.851859,80.139533",
					    "MH0002,20180401183400,12.852593,80.138911",
					    "MH0002,20180402042500,12.845812,80.152682",
					    "MH0002,20180402091800,12.856560,80.134983",
					    "MH0002,20180402185800,12.857596,80.134017",
					    "MH0002,20180402202200,12.858426,80.133448",
					    "MH0002,20180402223400,12.859199,80.132597",
					    "MH0002,20180402233900,12.860128,80.131695", };
		
	int i;
	for (i = 0; i < 10; ++i)
		write(fd, reqs[i], strlen(reqs[i]));
	close(fd);
	
	return 0;
}

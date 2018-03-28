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
	int fd = socket(PF_INET, SOCK_DGRAM, 0);
	if (fd < 0) exit_err("socket");

	struct sockaddr_in add;
	memset(&add, 0, sizeof(struct sockaddr_in));
	add.sin_family = AF_INET;
	add.sin_port = htons(20000);
	add.sin_addr.s_addr = inet_addr("127.0.0.1");

	int rt = connect(fd, (struct sockaddr*)&add, sizeof(struct sockaddr_in));
	if (rt < 0) exit_err("connect");

	int i;
	for (i = 0; i < 10; ++i) {
		char buf[100];
		size_t sz = 0;

		buf[0] = 6; sz += 1;

		char* source = buf + 1;
		strncpy(source, "MH0002", 6);
		source += 6; sz += 6;

		int* time = (int*)source;
		*time = 100 + i; sz += 4; ++time;

		float* lat = (float*)time;
		*lat = 12.84 + 0.01*i; sz += 4; ++lat;

		float* lng = lat;
		*lng = 80.15 + 0.01*i; sz += 4; ++lng;

		write(fd, buf, sz);
	}
	
	close(fd);
	getchar();

	return 0;
}


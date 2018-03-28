#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <stdio_ext.h>
#include <pthread.h>

#define exit_err(msg) \
	do { perror(msg); exit(EXIT_FAILURE); } while(0)

struct context {
	int time;
	char sourceId[10];
	char imgFileName[20];
};

typedef struct context context;

void* on_thread_start(void* arg) {
	struct context* ctx = (struct context*)arg;

	int fd = socket(PF_INET, SOCK_STREAM, 0);
	if (fd < 0) exit_err("socket");

	struct sockaddr_in add;
	memset(&add, 0, sizeof(struct sockaddr_in));
	add.sin_family = AF_INET;
	add.sin_port = htons(20500);
	add.sin_addr.s_addr = inet_addr("127.0.0.1");

	int rt = connect(fd, (struct sockaddr*)&add, sizeof(struct sockaddr_in));
	if (rt < 0) exit_err("connect");

	char buf[100];
	size_t sz = 0;

	buf[0] = 6; sz += 1;

	char* source = buf + 1;
	strncpy(source, ctx->sourceId, 6);
	source += 6; sz += 6;

	int* time = (int*)source;
	*time = ctx->time; sz += 4; ++time;
	rt = write(fd, buf, sz);
	if (rt < 0) {
		close(fd);
		return NULL;
	}

	int img = open(ctx->imgFileName, O_RDONLY);
	if (img < 0) exit_err("open");

	while(1) {
		char buf[BUFSIZ];
		int rt = read(img, buf, BUFSIZ);
		if (rt == 0) break;
		if (rt < 0) exit_err("read");
		rt = write(fd, buf, rt);
		if (rt < 0) {
			close(fd);
			close(img);
			return NULL;
		}
	}

	close(fd);
	close(img);
}

int main(int argc, char const *argv[])
{	
	#define N 2
	pthread_t threads[N];
	context arr[N];

	char* sources[] = { "MH0001", "MH0002", "MH0003" };
	char* fileNames[] = { "img1.jpg", "img2.jpg", "img3.jpg" };

	int i;
	for (i = 0; i < N; ++i) {
		arr[i].time = i * 1000;
		strcpy(arr[i].sourceId, sources[i % 3]);
		strcpy(arr[i].imgFileName, fileNames[i % 3]);
		pthread_create(&threads[i], NULL, on_thread_start, &arr[i]);
	}

	for (i = 0; i < N; ++i)
		pthread_join(threads[i], NULL);
	
	getchar();

	return 0;
}


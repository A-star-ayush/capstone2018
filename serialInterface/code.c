#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <termios.h>
#include <unistd.h>
#include <string.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <time.h>
 
/* My Arduino is on /dev/ttyACM0 */
char *portname = "/dev/ttyACM0";

#define exit_err(msg) \
	do { perror(msg); exit(EXIT_FAILURE); } while(0)

int main(int argc, char *argv[])
{
 	int fd;
 	fd = open(portname, O_RDWR | O_NOCTTY);
 	if (fd  < 0)
 		exit_err("open");
 
	struct termios toptions;
 	tcgetattr(fd, &toptions);
 

	/* Set custom options */
 
	/* 9600 baud */
 	cfsetispeed(&toptions, B9600);
 	cfsetospeed(&toptions, B9600);

 	/* 8 bits, no parity, no stop bits */
 	toptions.c_cflag &= ~PARENB;
 	toptions.c_cflag &= ~CSTOPB;
 	toptions.c_cflag &= ~CSIZE;
 	toptions.c_cflag |= CS8;
 
 	/* no hardware flow control */
 	toptions.c_cflag &= ~CRTSCTS;
 	/* enable receiver, ignore status lines */
 	toptions.c_cflag |= CREAD | CLOCAL;
 	/* disable input/output flow control, disable restart chars */
 	toptions.c_iflag &= ~(IXON | IXOFF | IXANY);
 
 	/* disable canonical input, disable echo,
 	   disable visually erase chars,
 	   disable terminal-generated signals */
 	toptions.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);
 	/* disable output processing */
 	toptions.c_oflag &= ~OPOST;
 
	/* wait for 12 characters to come in before read returns */
	/* WARNING! THIS CAUSES THE read() TO BLOCK UNTIL ALL */
	/* CHARACTERS HAVE COME IN! */
 	toptions.c_cc[VMIN] = 30;
 	/* no minimum time to wait before read returns */
 	toptions.c_cc[VTIME] = 0;
 
	/* commit the options */
 	tcsetattr(fd, TCSANOW, &toptions);
 
	/* Wait for the Arduino to reset */
 	usleep(1000*1000);
 	/* Flush anything already in the serial buffer */
 	tcflush(fd, TCIFLUSH);
 	
 	int soc = socket(PF_INET, SOCK_DGRAM, 0);
 	if (soc < 0) exit_err("socket");

 	struct sockaddr_in add;
 	add.sin_family = AF_INET;
 	add.sin_port = htons(20000);
 	add.sin_addr.s_addr = inet_addr("13.127.218.240");
 	
	int rt = connect(soc, (struct sockaddr*)&add, sizeof(struct sockaddr_in));
	if (rt < 0) exit_err("connect");

 	while(1) {
 		int rt = write(fd, "G", 1);
 		if (rt < 0)
 			exit_err("write");
 		
 		tcflush(fd, TCIFLUSH);

 		char buf[BUFSIZ];
 		while(1) {
 			int rt = read(fd, buf, BUFSIZ);
 			if (rt < 0) exit_err("read");
 			break;
 		}

 		float lat, lon;
 		unsigned int tim;

 		char* tmp = strchr(buf, ' ');
 		lat = strtof(tmp, &tmp);
 		++tmp;
 		tmp = strchr(tmp, ' ');
 		lon = strtof(tmp, &tmp);

 		char buf2[100];
 		size_t sz = 0;

		buf2[0] = 6; sz += 1;

		char* source = buf2 + 1;
		strncpy(source, "MH0002", 6);
		source += 6; sz += 6;

		int* ptr_time = (int*)source;
		*ptr_time = time(NULL); sz += 4; ++ptr_time;

		float* ptr_lat = (float*)ptr_time;
		*ptr_lat = lat; sz += 4; ++ptr_lat;

		float* ptr_lng = ptr_lat;
		*ptr_lng = lon; sz += 4; ++ptr_lng;

		write(soc, buf2, sz);
 		
 		sleep(8);
 	}

return 0;
}
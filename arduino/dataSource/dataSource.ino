// Before writing this program, issue ATE0&W to SIM808 once

#define WAIT_SIM808 2000
#define WAIT_GPSPOWER 1000
#define WAIT_GPSFIX 10000
#define WAIT_NEXTREADING 10000

char response[100];
char fix[2];
char dateTime[19];
char latitude[11];
char longitude[12];

char checkSIM808[] = { "AT" };
char turnOnGPS[] = { "AT+CGNSPWR=1" };
char getGPS[] = { "AT+CGNSINF" };
char setAccessPoint[] = { "AT+CSTT=\"bsnlnet\"" };

char OK[] = { "OK" };

char ERR_SIM808_INIT[] = { "Could not initialize SIM808. Waiting for 2 seconds." };
char ERR_GPS_POWER[] = { "Could not power the gps. Trying again in 1 second." };
char ERR_ACCESS_POINT[] = { "Could not set access point. Retrying in 100 millseconds." };

char serverIP[] = { "13.126.97.148" };
char serverPort[] = { "20000" };

// issue ATE0 to turn off echo .. use ATE0&W to write this configuration into non-volatile memory
// at+cmee=<0, 1, 2> higher the value, more verbose is the error information

// at+cgnspwr=1 to turn on gps
// at+cgnsinf to get parsed NMEA information

// at+csq to get singal quality report
// at+cstt="bsnlnet" to specify the access point
// at+ciicr to connect to the access point
// at+cifst to get you local ip address

// at+cipstart="TCP","publiIP","port" to make a TCP connection to the specified ip and port
// at+cipsend to send data to the above connection
    // > prompt will appear, termiate your message with 1A = 26
// at+cipstatus to query the current connection status

/*
// Calculating distance using the Haversine Formulae
double R=6371000;
double l1=fla*M_PI/180; //latitude of 1 in rad
double l2=flo*M_PI/180; //longitude of 1 in rad
double l3=la*M_PI/180; //latitude of 2 in rad
double l4=lo*M_PI/180; //longitude of 2 in rad
double dl1=l1-l3; // delta latitude
double dl2=l2-l4; //delta longitude
double a=square(sin(dl1/2))+cos(l1)*cos(l3)*square(sin(dl2/2));
double c=2*atan2(sqrt(a),sqrt(1-a));
double d=c*R;
*/

/* Utility Functions */

void emptyReadBuffer() {
  while (Serial1.available())
      int temp = Serial1.read();
}

void emptyWriteBuffer() {
  Serial1.flush();
}

boolean compareStrings(char* a, char* b) {
  if (strlen(a) != strlen(b))
    return false;
  int i;
  for (i = 0; a[i] != '\0'; ++i) {
    if (a[i] != b[i])
      return false;
  }

  return true;
}

int strchr(char* str, char c) {
  int i;
  for (i = 0; str[i] != '\0'; ++i) {
    if (str[i] == c)
      return i;
  }
  return -1;
}

void strncpy(char* dest, char* source, int n) {
  int i;
  for (i = 0; i < n; ++i)
    dest[i] = source[i];
  dest[i] = '\0';
}


void strncpy(char* dest, char* source, int n, char c) {
  int i;
  for (i = 0; i < n; ++i) {
    if (source[i] == c)
      break;
    dest[i] = source[i];
  }
  dest[i] = '\0';
}

void parseGPS() {
  char* str;
  str = response + strchr(response, ',') + 1;
 
  fix[0] = str[0];
  fix[1] = '\0';

  if (fix[0] == '0')
    return;
    
  str = str + strchr(str, ',') + 1;
  strncpy(dateTime, str, 18, ',');
  
  str = str + strchr(str, ',') + 1;
  strncpy(latitude, str, 10, ',');
  
  str = str + strchr(str, ',') + 1;
  strncpy(longitude, str, 11, ',');
}

/* I/O Functions */

void sendCommand(char* cmd) {
  emptyReadBuffer();
  int i;
  for (i = 0; cmd[i] != '\0'; ++i) 
    Serial1.write(cmd[i]);
  
  Serial1.write('\r');
  emptyWriteBuffer();
}

void readResponse() {
  int i = 0;
  int delimeters = 0;
  while(1) {
    if (Serial1.available()) {
      int inByte = Serial1.read();
      // Serial.print("\tRead: ");
      // Serial.println((char)inByte);
      if (inByte == '\r' || inByte == '\n')
        ++delimeters;
      else
        response[i++] = inByte;
    }

    if (delimeters == 4)
      break;
  }
  response[i] = '\0';
}

boolean verify(char* request, char* expectedResponse) {
  sendCommand(request);
  readResponse();
  if (compareStrings(response, expectedResponse))
    return true;
  else
    return false;
}

void loopUntil(char* request, char* expectedResponse, char* error, int delayTime) {
    while(1) {
      if (verify(request, expectedResponse))
        break;
      else
        Serial.println(error);
        delay(delayTime);
    }
}

/* Arduino Functions */

void setup() {
  Serial.begin(9600);
  Serial1.begin(9600);

  Serial.println("Initialized the two Serial Interfaces.");
  Serial.println("Waiting for SIM808 to initialize.");
  
  loopUntil(checkSIM808, OK, ERR_SIM808_INIT, WAIT_SIM808);
  Serial.println("SIM808 Initialized.");

  loopUntil(turnOnGPS, OK, ERR_GPS_POWER, WAIT_GPSPOWER);
  Serial.println("Turned on GPS Power.");

  Serial.println("Waiting for a satellite fix.");
  while(1) {
    sendCommand(getGPS);
    readResponse();
    parseGPS();
    if (fix[0] == '1')
      break;
    else {
      Serial.println("Could not obtain a satellite fix. Retrying in 10 seconds.");
      delay(WAIT_GPSFIX);
    }
  }
  Serial.println("Obtained a satellite fix.");

  loopUntil(setAccessPoint, OK, ERR_ACCESS_POINT, 100);
  Serial.println("Set Access point name.");
}

void loop() {
  sendCommand(getGPS);
  readResponse();
  parseGPS();

  
  delay(WAIT_NEXTREADING);
}


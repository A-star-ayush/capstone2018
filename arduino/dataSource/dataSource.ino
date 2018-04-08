// issue ATE0 to turn off echo .. use ATE0&W to write this configuration into non-volatile memory (do this once to sim808)
// at+cmee=<0, 1, 2> higher the value, more verbose is the error information

#include <SD.h>
#include <SPI.h>

int CS_PIN = 53;

File file;
char fname[] = { "data.txt" };
int offlineModeAvailable = 0;

#define WAIT_SIM808 2000
#define WAIT_GPSPOWER 1000
#define WAIT_GPSFIX 10000
#define WAIT_NEXTREADING 10000

char sourceId[] = { "MH0010" };

char response[100];
char fix[2];
char dateTime[19];
char latitude[11];
char longitude[12];

int hadLostConnectivity = 0;

char checkSIM808[] = { "AT" };
char turnOnGPS[] = { "AT+CGNSPWR=1" };
char getGPS[] = { "AT+CGNSINF" };

char gprsServiceStatus[] = { "AT+CGATT?" };
char setModeSingle[] = { "AT+CIPMUX=0" };
char setModeNormal[] = { "AT+CIPMODE=0" };
char setAccessPoint[] = { "AT+CSTT=\"bsnlnet\"" };
char wirelessConnection[] = { "AT+CIICR" };
char getLocalIP[] = { "AT+CIFSR" };

char connectToServer[] = { "AT+CIPSTART=\"UDP\",\"13.127.40.45\",\"20000\"" };
char sendToServer[] = { "AT+CIPSEND" };
char disconnectServer[] = { "AT+CIPCLOSE" };

char OK[] = { "OK" };
char GPRS_SERVICE_OK[] = { "+CGATT: 1" };

char ERR_SIM808_INIT[] = { "Could not initialize SIM808. Waiting for 2 seconds." };
char ERR_GPS_POWER[] = { "Could not power the gps. Trying again in 1 second." };
char ERR_ACCESS_POINT[] = { "Could not set access point. Retrying in 1 second." };
char ERR_OTHER[] = { " Some other error occured" };

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


/*** Utility Functions ***/

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
  strncpy(dateTime, str, 18, '.');
  
  str = str + strchr(str, ',') + 1;
  strncpy(latitude, str, 10, ',');
  
  str = str + strchr(str, ',') + 1;
  strncpy(longitude, str, 11, ',');
}



/*** I/O Functions ***/

void sendCommand(char* cmd) {
  emptyReadBuffer();
  Serial.print("SendCommand: ");
  Serial.println(cmd);
  int i;
  for (i = 0; cmd[i] != '\0'; ++i) 
    Serial1.write(cmd[i]);
  
  Serial1.write('\r');
  emptyWriteBuffer();
}

void readResponse(int count  = 4) {
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

    if (delimeters == count)
      break;
  }
  response[i] = '\0';
  Serial.print("Response: ");
  Serial.println(response);
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

void writeString(char* str) {
  for (int i = 0; str[i] != '\0'; ++i)
    Serial1.write(str[i]);
}

void serverConnect() {
  sendCommand(connectToServer);
  delay(5000);
  sendCommand(sendToServer);
  delay(2000);
  emptyReadBuffer();
}

void serverDisconnect() {
  delay(3000);
  sendCommand(disconnectServer);
  delay(3000);
}

void pushGPS() {
  if (offlineModeAvailable) {
    while(1) {
      String str = readLine();
      if (str.length() < 10)
        break;
      else {
        serverConnect();
        Serial1.print(str);
        Serial1.print(26);
        serverDisconnect();
      }
    }

    SD.remove(fname);
    if (createFile(fname)){
      offlineModeAvailable = 1;
      Serial.println("Offline mode available.");
    } else
        Serial.println("Offline mode unavailable.");
  }
  
  serverConnect();
  writeString(sourceId);
  Serial1.write(',');
  writeString(dateTime);
  Serial1.write(',');
  writeString(latitude);
  Serial1.write(',');
  writeString(longitude);
  Serial1.write(26);
  serverDisconnect();
}

void pushOffline() {
  file.print(sourceId);
  file.print(",");
  file.print(dateTime);
  file.print(",");
  file.print(latitude);
  file.print(",");
  file.print(longitude);
  file.print("\n");
}

void getSatelliteFix() {
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
}

void tryWirelessConnection() {
  sendCommand(setAccessPoint);
  readResponse();
  sendCommand(wirelessConnection);
  readResponse();
  sendCommand(getLocalIP);
  readResponse();
}

/*** SD Card Functions ***/

boolean initializeSD()
{
  pinMode(CS_PIN, OUTPUT);

  if (SD.begin())
    return true;
  else
    return false;
}

int createFile(char filename[])
{
  file = SD.open(filename, FILE_WRITE);

  if (file)
  {
    Serial.println("File created successfully.");
    return 1;
  } else
  {
    Serial.println("Error while creating file.");
    return 0;
  }
}

void closeFile()
{
  if (file)
  {
    file.close();
    Serial.println("File closed");
  }
}

int openFile(char filename[])
{
  file = SD.open(filename);
  if (file)
  {
    Serial.println("File opened with success!");
    return 1;
  } else
  {
    Serial.println("Error opening file...");
    return 0;
  }
}

String readLine()
{
  String received = "";
  char ch;
  while (file.available())
  {
    ch = file.read();
    if (ch == '\n')
    {
      return String(received);
    }
    else
    {
      received += ch;
    }
  }
  return "";
}


/*** Arduino Functions ***/

void setup() {
  delay(5000);
  Serial.begin(9600);
  Serial1.begin(9600);

  while(!Serial1);
  
  Serial.println("Initialized the two Serial Interfaces.");
  Serial.println("Waiting for SIM808 to initialize.");
  
  loopUntil(checkSIM808, OK, ERR_SIM808_INIT, WAIT_SIM808);
  Serial.println("SIM808 Initialized.");

  loopUntil(turnOnGPS, OK, ERR_GPS_POWER, WAIT_GPSPOWER);
  Serial.println("Turned on GPS Power.");

  getSatelliteFix();

  loopUntil(setModeSingle, OK, ERR_OTHER, 1000);
  Serial.println("Set Single Communication Mode.");
  loopUntil(setModeNormal, OK, ERR_OTHER, 1000);
  Serial.println("Set normal / non-transparent mode.");

  Serial.println("Initializing SD card.");
  if (initializeSD()) {
    Serial.println("SD card initialized.");
    if (createFile(fname)){
      offlineModeAvailable = 1;
      Serial.println("Offline mode available.");
    } else
        Serial.println("Offline mode unavailable.");
  }
  else
    Serial.println("Problem initializing SD card. Offline mode unavailable.");
  
  Serial.println("Entering the loop.");
  tryWirelessConnection();
}

void loop() {
  sendCommand(getGPS);
  readResponse();
  parseGPS();

  if (fix[0] == '1') {
    if (verify(gprsServiceStatus, GPRS_SERVICE_OK)){
      if (hadLostConnectivity) {
        tryWirelessConnection();
        hadLostConnectivity = 0;
      } else
          pushGPS();
    } else {
      hadLostConnectivity = 1;
      if (offlineModeAvailable)
        pushOffline(); 
    }
  } else {
    Serial.println("Lost fix to the satellite");
    getSatelliteFix();
  }
  
  delay(WAIT_NEXTREADING);
}


import Client from "ssh2-sftp-client";
const sftp = new Client();
let remotePath = "foo.txt";
let dst = "copy.txt";
const conn = sftp.connect({
  host: "localhost",
  port: 1234,
  username: "foo",
  password: "bar",
});
conn
  .then((sftpResponse) => {
    // sftpResponse.writeFile("foo.txt", "555");

    sftpResponse.fastGet(remotePath, dst, {}, (err) => {
      if (err) console.log(err);
    });
  })
  .then((data) => {
    console.log(data, "the data info");
  })
  .catch((err) => {
    console.log(err, "catch error");
  });

/* import { Client } from "ssh2";
const conn = new Client();
conn
  .on("ready", () => {
    console.log("Client :: ready");

    conn.sftp((err, sftp) => {
      if (err) throw err;
      console.log("CONNECTION STABLISHED :: SFTP SERVER");
      console.log(sftp.eventNames());
    });
  })
  .connect({
    host: "localhost",
    port: 1234,
    username: "foo",
    password: "bar",
  });
 */

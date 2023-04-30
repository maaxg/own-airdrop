import { timingSafeEqual } from "crypto";
import { open, read, readFileSync, writeFileSync } from "fs";
import * as ssh2 from "ssh2";
import { inspect } from "util";

const allowedUser = Buffer.from("foo");
const allowedPassword = Buffer.from("bar");

function checkValue(input: any, allowed: any) {
  const autoReject = input.length !== allowed.length;
  if (autoReject) {
    // Prevent leaking length information by always making a comparison with the
    // same input when lengths don't match what we expect ...
    allowed = input;
  }
  const isMatch = timingSafeEqual(input, allowed);
  return !autoReject && isMatch;
}

// This simple SFTP server implements file uploading where the contents get
// ignored ...
const OPEN_MODE = ssh2.utils.sftp.OPEN_MODE;
const STATUS_CODE = ssh2.utils.sftp.STATUS_CODE;
const flagsToString = ssh2.utils.sftp.flagsToString;
const PORT = 1234;

new ssh2.Server(
  {
    hostKeys: [readFileSync("./../../.ssh/id_rsa")],
    banner: "This is our server",
  },
  (client) => {
    console.log("Client connected!");

    client
      .on("authentication", (ctx) => {
        let allowed = true;
        if (!checkValue(Buffer.from(ctx.username), allowedUser))
          allowed = false;

        switch (ctx.method) {
          case "password":
            if (!checkValue(Buffer.from(ctx.password), allowedPassword))
              return ctx.reject();
            break;
          default:
            return ctx.reject();
        }

        if (allowed) ctx.accept();
        else ctx.reject();
      })
      .on("ready", () => {
        console.log("Client authenticated!");

        client.on("session", (accept, reject) => {
          const session = accept();
          session.on("sftp", (accept, reject) => {
            console.log("Client SFTP session");
            const openFiles = new Map();
            let handleCount = 0;
            const sftp = accept();

            sftp
              .on("OPEN", (reqid, filename, flags, attrs) => {
                const strinfiedFlags = flagsToString(flags);
                console.log("Client Listener :: OPEN");
                openFiles.set("filename", filename);
                const handle = Buffer.alloc(4);
                openFiles.set(handleCount, true);
                handle.writeUInt32BE(handleCount++, 0);
                if (OPEN_MODE.WRITE & flags) {
                  sftp.handle(reqid, handle);
                }
                if (OPEN_MODE.READ & flags && strinfiedFlags) {
                  open(filename, strinfiedFlags, function (err, fd) {
                    if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
                    const hndler = Buffer.alloc(4);
                    hndler.writeInt32BE(fd, 0);
                    openFiles.set(fd, filename);
                    sftp.handle(reqid, hndler);
                  });
                }
              })
              .on("WRITE", (reqid, handle, offset, data) => {
                console.log(
                  `WRITING FILE :: ${openFiles.get("filename")} :: ${reqid}`
                );
                if (
                  handle.length !== 4 ||
                  !openFiles.has(handle.readUInt32BE(0))
                ) {
                  return sftp.status(reqid, STATUS_CODE.FAILURE);
                }

                // Fake the write operation
                writeFileSync(`./${openFiles.get("filename")}`, data);
                sftp.status(reqid, STATUS_CODE.OK);

                console.log(
                  `Write to file at offset ${offset}: ${inspect(data)}`
                );
              })
              .on("FSTAT", function (reqid, handle) {
                let fd;
                if (
                  handle.length !== 4 ||
                  !openFiles.has((fd = handle.readUInt32BE(0)))
                )
                  return sftp.status(reqid, STATUS_CODE.FAILURE);
                console.log(`FSTAT :: ${reqid}`);
                console.log("FSTAT: original filename = ", openFiles.get(fd));
                //fake attrs
                var attrs = {
                  size: 10 * 1024,
                  uid: 9001,
                  gid: 9001,
                  atime: (Date.now() / 1000) | 0,
                  mtime: (Date.now() / 1000) | 0,
                  mode: 0o666,
                };

                sftp.attrs(reqid, attrs);
              })
              .on("READ", function (reqid, handle, offset, length) {
                let fd;
                if (
                  handle.length !== 4 ||
                  !openFiles.has((fd = handle.readUInt32BE(0)))
                )
                  return sftp.status(reqid, STATUS_CODE.FAILURE);
                console.log(
                  `READING FILE :: ${openFiles.get("filename")} :: ${reqid}`
                );

                const buf = Buffer.alloc(length);
                read(fd, buf, 0, length, offset, function (err) {
                  if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);

                  sftp.data(reqid, buf);
                });
              })
              .on("CLOSE", (reqid, handle) => {
                let fnum;
                if (
                  handle.length !== 4 ||
                  !openFiles.has((fnum = handle.readUInt32BE(0)))
                ) {
                  return sftp.status(reqid, STATUS_CODE.FAILURE);
                }

                console.log("Ending action");
                openFiles.delete("filename");
                openFiles.delete(fnum);

                sftp.status(reqid, STATUS_CODE.OK);
              });
          });
        });
      })
      .on("close", () => {
        console.log("Client disconnected");
      });
  }
).listen(PORT, function () {
  console.log("Listening on port " + PORT);
});

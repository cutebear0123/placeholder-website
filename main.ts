import { serveDir, serveFile } from "jsr:@std/http/file-server";
import { UAParser } from "npm:ua-parser-js";

const template = await Deno.readTextFile("template.html");
const kv = await Deno.openKv();

function isbot(req: Request) {
  const pathname = new URL(req.url).pathname;
  if (pathname.includes(".php") || pathname.includes(".env")) return true;
  if (req.headers.get("user-agent")?.includes("gptbot")) return true;
  return false;
}
Deno.serve(async (req: Request, conn) => {
  let html = template;
  const pathname = new URL(req.url).pathname;
  if (isbot(req)) {
    const start = Date.now();
    const data = {
      path: pathname,
      ip: conn.remoteAddr.hostname,
      ua: req.headers.get("user-agent"),
      time: 0,
    };
    const emptyStream = new ReadableStream({
      start() {
      },
      async cancel() {
        data.time = Date.now() - start;
        await kv.set(["bot", crypto.randomUUID()], data);
      },
    });
    return new Response(emptyStream, {
      headers: {
        "content-type": "text/html",
      },
    });
  }
  if (pathname === "/") {
    if (!(req.headers.get("accept")?.includes("html"))) {
      html = "{ipv4}\n{iploc}\n{ua}";
    }
    html = html.replace("{body}", await Deno.readTextFile("index.html"));

    html = html.replace("{ipv4}", conn.remoteAddr.hostname);

    const re = new RegExp(
      /(^127\.)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)|(^[fF][cCdD])/,
      "i",
    );
    let iploc = "";
    if (conn.remoteAddr.hostname.match(re)) {
      iploc = "You are from local network!";
    } else {
      const data = await (await fetch(
        `http://ip-api.com/json/${conn.remoteAddr.hostname}`,
      ))
        .json();
      console.log(data);
      iploc = `You are located at ${data["countryCode"]} ${data["region"]} ${
        data["city"]
      } using ${data["isp"]}`;
    }
    html = html.replace("{iploc}", iploc);
    if (req.headers.has("user-agent")) {
      let ua = `You are using ${req.headers.get("user-agent")}`;
      const { browser, os } = UAParser(req.headers.get("user-agent"));
      if (browser.name && os.name) {
        if (browser.name.includes("Safari")) {
          html = html.replace(
            "{troll}",
            `
<p>Click for more...</p>
<script id="test">
document.body.onclick = function(){
(new Audio('/test.mp3')).play()
}
document.getElementById('test').remove();
</script>

`,
          );
        }
        ua = `You are using ${browser} on ${os}`;
      }
      html = html.replace("{ua}", ua);
      html = html.replace("{troll}", "");
    }
  } else if (pathname == "/css.css") {
    return serveFile(req, "css.css");
  } else if (pathname == "/test.mp3") {
    return serveFile(req, "test.mp3");
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
});

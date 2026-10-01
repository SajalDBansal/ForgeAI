import http from "node:http"

const port = Number(process.env.PORT ?? 3000)

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Runtime Base</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1d252d;
        background: #f7f8fb;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-content: center;
        gap: 12px;
        padding: 48px;
        text-align: center;
      }
      p {
        margin: 0;
        color: #65758b;
        font-size: 18px;
      }
      h1 {
        margin: 0;
        font-size: clamp(36px, 7vw, 68px);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Runtime base</h1>
      <p>Node, Python and Go are ready for imported repositories.</p>
    </main>
  </body>
</html>`

http
  .createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(page)
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`runtime-base listening on ${port}`)
  })

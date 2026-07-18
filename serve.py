# Локальный dev-сервер с правильными MIME-типами (.js/.mjs/.wasm), как на GitHub Pages.
# На Windows стандартный http.server берёт типы из реестра и отдаёт .mjs как text/plain,
# из-за чего браузер отказывается импортировать модули — поэтому guess_type переопределён.
import http.server

class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        p = str(path).lower()
        if p.endswith('.mjs') or p.endswith('.js'):
            return 'text/javascript'
        if p.endswith('.wasm'):
            return 'application/wasm'
        return super().guess_type(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

http.server.test(HandlerClass=Handler, port=8236, bind='127.0.0.1')

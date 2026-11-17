import re, sys
import os
proj = os.path.dirname(os.path.abspath(__file__)) + '/'
out = sys.argv[1]
def parts(path):
    s = open(path, encoding='utf-8').read()
    xa = s.index('<x-dc>') + len('<x-dc>'); xb = s.index('</x-dc>')
    body = s[xa:xb]
    ha = body.index('<helmet>'); hb = body.index('</helmet>') + len('</helmet>')
    helmet = body[ha+len('<helmet>'):hb-len('</helmet>')]
    markup = body[:ha] + body[hb:]
    m = re.search(r'<script type="text/x-dc" data-dc-script[^>]*>(.*?)</script>', s, re.S)
    return helmet, markup.strip(), m.group(1)
mh, mm, ms = parts(proj + 'Main.dc.html')
ih, im, iscr = parts(proj + 'Intro.dc.html')
runtime = open('' + proj + 'runtime.js', encoding='utf-8').read()
html = f'''<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>凱倫的日語記事簿｜日文課程</title>
{mh}
</head>
<body>
<div id="app"></div>
<template id="tpl-Main">
{mm}
</template>
<template id="tpl-Intro">
{im}
</template>
<script>
{runtime}
</script>
<script>
(function () {{
{iscr}
DC.define('Intro', Component);
}})();
(function () {{
{ms}
DC.define('Main', Component);
}})();
DC.mount('Main', document.getElementById('app'), {{}});
</script>
</body>
</html>
'''
open(out, 'w', encoding='utf-8').write(html)
print('ok', len(html))

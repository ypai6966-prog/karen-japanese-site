# 凱倫的日語記事簿｜日文課程網站

純 HTML／CSS／JS 的靜態網站（日系手帳風），含四季開場動畫、今日一句、五十音翻牌、程度測驗、課程篩選與諮詢表單。

## 資料夾
- `site/index.html`：可直接部署的網站（Cloudflare Pages 會發布這個資料夾）
- `source/`：設計稿原始檔與打包腳本

## 本機預覽
雙擊 `site/index.html` 即可；或在此資料夾執行 `python3 -m http.server -d site 8000`，開 http://localhost:8000。

## 部署
網站放在 Cloudflare Pages（專案名稱 `karen-japanese-site`），正式網址：https://karen-japanese-site.pages.dev

推到 GitHub 的 `main` 分支後，Cloudflare Pages 會自動更新正式網址；其他分支會產生預覽網址。

Cloudflare Pages 設定：Framework preset `None`、Build command 留空、Build output directory `site`。

## 修改方式
直接改 `site/index.html`（內含全部 HTML、CSS、JS，文字內容在 `<template id="tpl-Main">` 內，課程、FAQ、今日一句等資料在 `COURSES`、`PHRASES` 等陣列）。
原始檔 `source/*.dc.html` 是 Claude 設計畫布格式，需要重新輸出網站時執行：
`python3 source/build.py site/index.html`
注意：若直接改了 `site/index.html`，就不要再用 build.py 覆蓋，兩邊擇一維護。建議之後以 `site/index.html` 為準。

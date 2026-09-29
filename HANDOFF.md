# LoopNote 開発引き継ぎ

最終確認日: 2026-07-23

この文書は、別のGPTアカウントでLoopNoteの開発を続けるための引き継ぎ資料です。
次の担当は、作業前にこの文書と `git diff` を確認してください。

## 1. プロジェクト概要

LoopNoteは、Google Sheetsの問題データを読み込み、スマホ中心で社労士試験の問題演習をするWebアプリです。

- 本番URL: https://new-chat-five-wine.vercel.app
- Vercelプロジェクト名: `new-chat`
- Vercel Project ID: `prj_uGxoCx8R0K170ifSfa25Aejlp7KE`
- Vercel Team ID: `team_GC1CvKs3A0CdasGZUWtjjMDl`
- GitHub: https://github.com/mituki0604/sharoushi-mondai-enshu
- ローカルURL: http://localhost:4173
- 作業フォルダ: `C:\Users\remit\Documents\Codex\2026-06-19\new-chat`
- 実装: HTML、CSS、Vanilla JavaScript、Vercel Functions
- Node.js: 24.x
- ビルド工程: なし

Google SheetsのURLはリポジトリやVercel環境変数には保存していません。
利用者がアプリの「設定」に入力したURLを、そのブラウザの `localStorage` に保存します。

### GPTアカウント切り替え時

- 同じPCで開発する場合、この作業フォルダを新しいGPTに指定すればファイルはそのまま利用できる
- GPTのチャット履歴は別アカウントへ自動移行されないため、この文書を最初に読ませる
- Codex、GitHub、Vercel、Googleのログインは別管理。必要に応じて各サービスへログインする
- 別PCへ移る場合、現状は未コミット変更が多いため、フォルダのコピーまたは適切なGitコミット・pushが必要
- 未コミットのままGitHubからcloneすると、現在の本番機能の多くが取得できない

## 2. 最初に守ること

現在の主要な実装は、最初のGitコミット後に行われており、未コミットです。

2026-07-23時点の状態:

```text
 M README.md
 M app.js
 M data/questions.csv
 M index.html
 M styles.css
?? HANDOFF.md
```

`git reset --hard`、`git checkout --`、一括復元などで未コミット変更を消さないでください。
現在の本番環境は、この未コミットの作業ツリーからデプロイされています。

変更前に必ず実行:

```powershell
git status --short
git diff -- app.js index.html styles.css README.md data/questions.csv
```

## 3. ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 全画面のHTML、ダイアログ、操作ボタン |
| `styles.css` | PC・スマホのレスポンシブUI、正誤色、タイマー画面 |
| `app.js` | 問題変換、演習、履歴、復習、付箋、タイマー、同期 |
| `question-cache.js` | 問題データをIndexedDBへ保存・復元 |
| `api/questions.js` | Vercel上でGoogle Sheetsを取得するAPI |
| `server.mjs` | Node.js用ローカルサーバー |
| `server.ps1` | Node.jsなしでも動かせるPowerShellサーバー |
| `start-loopnote.bat` | PowerShellサーバーとブラウザを起動 |
| `data/questions.csv` | 未接続時の代替CSV。現在は見出しだけでデモ問題なし |
| `vercel.json` | Vercel Functions、静的ファイル、ルーティング設定 |
| `README.md` | 利用者向けの接続・起動説明 |
| `.vercel/project.json` | ローカルのVercelプロジェクト紐付け |

`.vercel` と `.tools` はGit管理対象外です。

## 4. スプレッドシート仕様

1行目は、左から次の7列にします。

```text
A: 問題番号
B: 科目
C: 単元
D: テーマ
E: 問題文
F: 回答
G: 解説
```

CSV見出し:

```csv
問題番号,科目,単元,テーマ,問題文,回答,解説
```

### 学習

ホームに次の順番で固定表示します。

1. `模試・問題集`
2. `白書・統計`
3. `罰則`
4. `数字`
5. `過去問`

表記揺れの一部は `normalizeLearning()` で補正します。

### 科目

自由入力です。例:

- 労働基準法
- 労働安全衛生法
- 労災保険法
- 雇用保険法
- 健康保険法
- 厚生年金保険法

### 単元・テーマ

自由入力です。科目の中を単元、その中をテーマとして分類します。
空欄は `標準単元`、`標準テーマ` として扱います。アプリでは複数の単元とテーマを同時選択できます。

### 回答

- `○`、`◯`、`〇`: 正解が○の自動採点
- `×`、`✕`、`✖`: 正解が×の自動採点
- 数字: 数字入力後に回答列の正解と自動比較
- それ以外の文字列: 「答えを見る」後に、利用者が「正解」「不正解」を自己採点
- 空欄: 正解未登録として表示し、採点や履歴記録はしない

### 問題番号

履歴・付箋・途中セッションの識別に使うため、原則として重複させないでください。
重複した場合、アプリ内部では2件目以降に `__2` などを付けますが、スプレッドシート側で一意にする方が安全です。

### 旧形式

移行用として次の6列も読み込めます。

```text
問題番号,科目,論点,問題文,回答,解説
```

新規データは必ず7列の新形式を使ってください。この形式は自動的に `過去問` に分類されます。

## 5. Google Sheets接続

現在の既定接続先は `app.js` の `DEFAULT_SHEET_SOURCE` にある「社労士アプリ」シートです。`SOURCE_CONFIG_VERSION` を更新すると、各端末の接続先を次回起動時に一度だけ既定URLへ移行できます。

1. Google Sheetsを「リンクを知っている全員が閲覧可」にする
2. 本番アプリ右上の「設定」を開く
3. 通常の編集URLを貼る
4. 「接続して保存」を押す
5. シート更新後は、右上の更新ボタンで手動同期する

自動更新はユーザー要望により無効です。

対応URL:

- `https://docs.google.com/spreadsheets/...`
- `https://script.google.com/...`

Google Sheetsの編集URLは、サーバー側でCSVエクスポートURLへ変換します。
Apps Scriptの場合は、CSVまたはJSONを返せます。
JSONは配列、または `{ "questions": [...] }` に対応しています。

## 6. 実装済み機能

### ホーム・絞り込み

- トップ画面で科目を直接選択
- 科目内で単元を複数選択
- 選択した単元内でテーマを複数選択
- 選択したテーマを順番に演習
- 選択したテーマをシャッフル
- 全学習・全科目シャッフル
- テーマ別の進捗表示
- ホームの総進捗表示
- 記憶リセット

### 問題演習

- 1問ずつ表示
- ○×は選択時に即時採点
- 数字回答は入力後に即時採点
- ○×以外は「答えを見る」後に自己採点
- 回答欄が空の問題は正解未登録として表示
- 回答後に「次の問題」または「演習完了」を表示
- 前の問題へ戻る
- 未回答問題をスキップ
- 何問目へ移動するか指定
- 問題番号を `QUESTION` の直下に表示
- 演習中の現在正答率を表示
- 回答後に、その問題の通算正答率と直近10回の正誤を表示
- 「押し間違い」で直前の正解・不正解を逆の結果へ修正
- リザルト画面から、その周で間違えた問題だけを履歴へ重複記録せずに解き直す
- 解説は「次の問題」ボタンの下に表示
- 問題ごとの付箋を登録・編集・削除
- 次回回答後に付箋を解説と一緒に表示
- 長文問題は問題領域内でスクロール可能

### 問題文表示

- 問題文はPC・スマホとも22px
- 問題文だけ自動改行
- 長文は句点の後で改行
- 1文が長すぎる場合は、自然な読点付近でも改行
- 短文とスプレッドシート内の手動改行は維持
- 問題文と解説で、2回以上の連続改行による空行を維持
- 解説には自動改行処理を適用しない

処理は `formatQuestionText()`、スタイルは `.question-card h2` にあります。

### 色

ユーザー指定により、日本の学習教材に合わせて次の配色です。

- 正解: 赤 `#d6534b`
- 不正解: 青 `#3975b7`

CSS変数:

```css
--answer-correct
--answer-correct-soft
--answer-incorrect
--answer-incorrect-soft
```

### 復習

- ホームから「前回の誤答」
- ホームの復習は学習と科目を組み合わせて絞り込み
- 科目・単元・テーマ選択画面から、その範囲の「復習」
- 指定日から指定日までに間違えた問題を復習
- 期間指定時は科目でも絞り込み
- 復習モードの回答は通常履歴へ記録しない
- 「前回の誤答」は、各問題の最新回答が不正解のものを対象にする
- 期間指定復習は、指定期間中の誤答記録を対象にする

### 履歴

- 回答日時
- 学習、科目、単元、テーマ
- 問題文
- 選択した回答
- 正解
- 正誤
- 最大500件
- 全体の回答数、正解数、正答率
- 誤答は日時付きで別の誤答ログにも保存

### ストップウォッチ

- 演習開始時に自動開始
- 演習中にストップ・スタート可能
- ストップ中は問題を隠す全画面表示
- 全画面をタップすると再開
- 回答操作時、手動停止中なら自動再開
- タブを閉じる、他アプリへ移動するなどで非表示になった時間は一旦停止
- 戻った時に、離れていた時間を「加算する」「加算しない」から選択
- 演習完了時に合計時間と1問あたり時間を表示
- 途中セッションにもタイマー状態を保存

### 途中再開

- 演習途中の問題順、現在位置、回答状態、正誤、タイマーを保存
- ホームに「続きから解く」を表示
- スプレッドシート接続先が変わった場合、古い途中セッションは破棄

## 7. ブラウザ内の保存データ

サーバー側のユーザーDBはありません。回答記録は端末・ブラウザごとです。
別スマホや別ブラウザには同期されません。

### localStorage

| キー | 内容 |
| --- | --- |
| `loopnote-source` | Google SheetsまたはApps ScriptのURL |
| `loopnote-answered` | 完了済み問題ID |
| `loopnote-history` | 回答履歴、最大500件 |
| `loopnote-mistake-log` | 日時付きの誤答記録 |
| `loopnote-question-notes` | 問題ごとの付箋 |
| `loopnote-active-session` | 途中セッション、回答状態、タイマー |
| `loopnote-data-version` | 保存データ形式のバージョン |

### IndexedDB

- DB名: `loopnote-question-cache`
- ストア: `manifests`
- ストア: `courseQuestions`
- 接続先ごと、科目ごとに正規化後の問題をキャッシュ

「記憶リセット」は進捗・回答履歴・誤答ログ・途中セッションを削除します。
接続設定と付箋は残します。

## 8. 同期・キャッシュの動き

1. 起動時にIndexedDBの保存済み問題を先に表示
2. キャッシュがなければ `/api/questions` から取得
3. 右上の更新ボタンは `refresh=1` とタイムスタンプを付けて強制取得
4. Vercel APIの通常レスポンスは60秒の共有キャッシュと300秒のstale-while-revalidate
5. 強制更新時は `Cache-Control: no-store`
6. 取得内容のSHA-256をバージョンとして利用

現在は手動更新だけです。自動ポーリングを復活させないでください。

## 9. ローカル起動

### Node.js

```powershell
npm start
```

または:

```powershell
node server.mjs
```

ブラウザ:

```text
http://localhost:4173
```

### PowerShellだけで起動

```powershell
.\server.ps1
```

または `start-loopnote.bat` をダブルクリックします。

### 環境変数で初期接続先を指定

```powershell
$env:SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
npm start
```

ただし、フロント側で一度設定した接続先は `localStorage` の値を使います。

## 10. 検証

最低限、変更後に次を実行します。

```powershell
node --check app.js
node --check api/questions.js
node --check server.mjs
git diff --check
```

ローカルAPI:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:4173/api/health
Invoke-WebRequest -UseBasicParsing http://localhost:4173/api/questions
```

UI変更は次を確認:

- 幅390px前後のスマホ表示
- 横スクロールが発生しない
- 短文と長文の問題
- ○×問題
- 自己採点問題
- 回答前、回答後、最終問題
- 解説と付箋
- ストップ、画面離脱、復帰
- 続きから再開

## 11. キャッシュバスター

`index.html` はCSSとJSにクエリ文字列を付けています。

現在:

```html
styles.css?v=20260929-1
app.js?v=20260929-1
```

`styles.css` または `app.js` を変更して本番公開する時は、両方のバージョンを新しい同じ値へ更新してください。
スマホに古いファイルが残る問題を避けるためです。

## 12. Vercelへ公開

この作業フォルダは、すでにVercelプロジェクトへリンクされています。

```powershell
npm exec --yes vercel@latest -- --yes --prod --no-color
```

NodeがPATHにない場合、このフォルダ内の `.tools\node` を使えます。

```powershell
$nodeDir = Get-ChildItem '.\.tools\node' -Directory |
  Select-Object -First 1 -ExpandProperty FullName
$env:Path = "$nodeDir;$env:Path"
& (Join-Path $nodeDir 'npm.cmd') exec --yes vercel@latest -- --yes --prod --no-color
```

デプロイ後に必ず確認:

```powershell
$response = Invoke-WebRequest -UseBasicParsing 'https://new-chat-five-wine.vercel.app/'
$response.StatusCode
```

さらに、本番HTMLが新しいキャッシュバスターを参照し、本番の `app.js` と `styles.css` に変更内容が含まれることを確認してください。

## 13. 実装上の注意

- フレームワーク導入や全面作り直しは、ユーザーが明示的に希望しない限り行わない
- スマホで1画面ずつテンポよく解けることを最優先する
- 回答後、選択肢領域が次へ進む操作へ切り替わる設計を維持する
- 解説は次へボタンの下に置く
- 正解は赤、不正解は青を維持する
- 問題文だけの自動改行を、解説へ適用しない
- 復習モードでは履歴を増やさない
- 問題IDを変えると、既存履歴・付箋・進捗との紐付けが切れる
- `DATA_VERSION` を変更すると回答済み・履歴・誤答ログが削除されるため、安易に変更しない
- `loopnote-active-session` の形式を変える場合は、旧versionの復元互換を考える
- スプレッドシートURLはクライアント設定であり、リポジトリへ直書きしない
- `data/questions.csv` は現在デモなし。勝手にサンプル問題を本番へ追加しない

## 14. 現状の制約

- ログイン機能なし
- サーバー側ユーザーDBなし
- 端末間の履歴・付箋同期なし
- PWAのService Workerなし
- オフライン時はIndexedDBにある問題だけ利用可能
- Google Sheetsは公開閲覧設定が必要
- 自動テストなし
- Git上では主要実装が未コミット

## 15. 次のGPTへ渡す最初の依頼文

以下を新しいGPTへ送ると、状況を把握しやすくなります。

```text
C:\Users\remit\Documents\Codex\2026-06-19\new-chat のLoopNoteを引き継いで開発してください。
最初に HANDOFF.md、README.md、git status、git diff を確認してください。
現在の主要実装は未コミットなので、既存変更を戻さないでください。
本番URLは https://new-chat-five-wine.vercel.app です。
変更後はスマホ幅でUI確認し、Vercelへ本番デプロイして公開URLまで検証してください。
```

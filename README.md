# Neon Kuyu

Tarayıcıda oynanan, 2D top-down, Brotato tarzı bir **roguelike bullet hell**. Saf HTML5 Canvas +
JavaScript (ES modules). Derleme adımı yok, harici görsel/ses dosyası yok: her şey kodla çiziliyor
ve WebAudio ile sentezleniyor. Tek oyunculu ya da **2-8 kişilik online co-op** (WebRTC) oynanabilir.
Ayrıca PWA olarak telefona/masaüstüne kurulabiliyor.

## Plan

1. **Simülasyon çekirdeği** (`src/sim/`): sabit adımlı (60 Hz), DOM'a ve çizime dokunmayan,
   tohumlu RNG ile tekrarlanabilir oyun mantığı. Tek oyunculu oyun ve co-op host'u aynı kodu çalıştırır.
2. **Veri odaklı içerik**: silahlar, yetenekler, düşmanlar ve dalgalar düz veri tabloları. Yeni bir
   silah ya da yetenek eklemek bir tabloya bir satır eklemek demek.
3. **Sunum katmanı** (`src/render/`, `src/audio/`): simülasyonun ürettiği olayları (`hit`, `kill`,
   `boom`...) ekran sarsıntısına, hit-stop'a, parçacıklara, hasar sayılarına ve seslere çevirir.
4. **Giriş** (`src/input/`): klavye+fare, Gamepad API ve dokunmatik kontroller tek bir
   "niyet"e (hareket, nişan, atılma) indirgenir. Son kullanılan cihaza otomatik geçilir.
5. **Co-op** (`src/net/`): host otoriter. İstemciler her tick'te girdi gönderir. Host saniyede
   20 kez ikili (binary) snapshot yayınlar. İstemciler diğer her şeyi enterpolasyonla, kendi
   karakterlerini ise **istemci tarafı tahmin + uzlaştırma** ile çizer.
6. **PWA**: manifest, service worker (offline açılış), ikonlar, tam ekran/yatay mod.

## Dosya yapısı

```
index.html            DOM menüleri + canvas
manifest.json         PWA manifest (fullscreen, landscape, ikonlar)
sw.js                 Service worker: uygulama kabuğunu önbelleğe alır, offline açılış
css/style.css         Menü ve overlay stilleri
icons/                SVG kaynak ikon + üretilmiş PNG'ler (192, 512, maskable, apple-touch)
vendor/peerjs.min.js  PeerJS 1.5.4 (WebRTC sinyalleşme; sadece co-op'ta yüklenir)
src/
  main.js             Giriş noktası: oyun döngüsü, modlar (tek/host/istemci), UI bağlantıları
  config.js           Sabitler (tick hızı, arena, ağ ayarları)
  rng.js              Tohumlu PRNG (mulberry32)
  sim/
    world.js          Sim sınıfı: oyuncular, savaş, mermiler, toplama, dalga yöneticisi, olaylar
    player.js         Paylaşılan hareket/atılma fonksiyonu (istemci tahmini de bunu kullanır)
    weapons.js        9 silah tanımı (veri) + kademe ölçekleme
    skills.js         18 yetenek tanımı (veri) + istatistik hesaplama
    enemies.js        9 düşman + boss tanımı ve yapay zekâ davranışları
    waves.js          Doğma tablosu, dalga kotaları, zorluk eğrileri
    map.js            Tohumdan harita: engeller, bölgeler, yapılar, çarpışma ızgarası
  render/
    renderer.js       Kamera, zemin, ışık haritası, varlık çizimleri
    fx.js             Olay → parçacık/sarsıntı/flash/banner/ses
    particles.js      Havuzlu parçacık sistemi
    hud.js            Can/XP/dalga/boss barı/silahlar
    sprites.js        Kodla üretilen, önbelleğe alınan sprite'lar
    mapart.js         Engeller, yapılar, Muhafız ve minimap çizimi
    icons.js          Silah ve yetenek ikonları (vektör)
  input/input.js      Klavye+fare, gamepad, dokunmatik; otomatik cihaz geçişi
  audio/sfx.js        WebAudio ses efektleri + prosedürel müzik
  ui/ui.js            Menüler, kartlar, gamepad ile menü gezintisi
  net/
    net.js            PeerJS host/istemci oturumları, kalp atışı, yeniden bağlanma
    protocol.js       İkili snapshot kodlama/çözme
    clientworld.js    Enterpolasyon + istemci tahmini
tools/                Test ve yardımcı betikler (oyun için gerekli değil)
```

## Nasıl çalıştırılır

ES modülleri `file://` üzerinden çalışmaz, bu yüzden herhangi bir statik sunucu gerekiyor:

```bash
python3 -m http.server 8080
# veya: npx serve .
```

Sonra `http://localhost:8080` adresini aç. `localhost` güvenli bağlam sayıldığı için service worker
ve PWA kurulumu yerelde de çalışır.

**Co-op'u denemek için:** bir sekmede *Oda Kur*, diğerinde (ya da başka bir cihazda) *Odaya Katıl*
ile 5 harfli kodu gir, veya lobideki *Davet linkini kopyala* ile linki paylaş (`?oda=KOD`).

## Yayınlama (HTTPS)

Service worker ve "ana ekrana ekle" HTTPS ister. Proje tamamen statik olduğu için klasörü olduğu
gibi yüklemen yeterli:

- **GitHub Pages:** repo → Settings → Pages → "Deploy from a branch" → `main` / root.
  Adres `https://<kullanıcı>.github.io/<repo>/` olur. Tüm yollar göreli, alt klasörde çalışır.
- **Netlify / Cloudflare Pages / Vercel:** build komutu yok, yayın klasörü `/`.

Her yayında `sw.js` içindeki `VERSION` değerini artır. Böylece kurulu istemciler yeni dosyaları alır.

### Co-op ağı hakkında

- Oyun trafiği tarayıcılar arasında doğrudan WebRTC ile akar, oyun sunucusu yoktur. Sadece ilk
  el sıkışma için PeerJS'in ücretsiz genel sinyal sunucusu (`0.peerjs.com`) kullanılır. PeerJS'in
  varsayılan STUN/TURN ayarları da dahil, bu sayede çoğu NAT arkasından bağlanılabiliyor.
- Kendi sinyal sunucunu kullanmak istersen (`npx peerjs --port 9000`) linke
  `&sinyal=alanadin.com:443/` ekle. Ayar tarayıcıda saklanır ve davet linklerine otomatik eklenir.
- Host oyunu simüle eder. Bağlantısı kopan oyuncunun karakteri sahnede "bağlantı yok" olarak
  bekler: aynı sekme yenilenip tekrar katılınca karakterini geri alır. Oyundan bilerek ayrılan
  oyuncu kaldırılır. Host ayrılırsa istemciler mesajla ana menüye döner. Oyun ortasında katılan
  oyuncu başlangıç silahıyla doğar ve kaçırdığı seviyelerin seçimlerini sonraki arada yapar.

## Oyun

- **Döngü:** 30 dalga, süre yok: bir dalga, tüm düşmanları temizlenince biter (zorluk yavaş ve
  geç yükselir, ilk dalgalar da artık dişli). **Seçimler anında olur:** seviye atlayınca ya da bir yapı ödül verince
  3 kart çıkar ve simülasyon tamamen durur (düşmanlar, mermiler, her şey). Co-op'ta herkes seçene kadar
  oyun durur, 30 sn sonra otomatik seçilir. Her 5. dalga
  **Kor Gözcü** boss'u (spiral, halka, hücum, nişanlı yelpaze ve çağırma desenleri; %50 canın
  altında öfkeli ikinci evre). Ölüm = baştan. Her koşu bir **tohuma** bağlı. Aynı tohum aynı
  silah tekliflerini ve düşman dizilimini üretir (tek oyunculu).
- **Harita:** 6400×4200'lük açık bir alan, tohumdan üretilir (host ve istemciler aynı haritayı
  kendileri kurar, ağdan harita gitmez). Kayalar, sütunlar ve kristaller yolu keser ve düşman
  mermilerini durdurur (siper). **Keşif sisi:** yalnızca gezdiğin yerler haritada görünür (co-op'ta ortak).
  Köşedeki minimap çevreni gösterir, **M / Tab / Select / 🗺** tüm haritayı açar. Düşmanlar takımın etrafında, ekran dışında doğar.
- **Yapılar** (üstünde durarak etkinleşir, düğme yok: klavye/gamepad/dokunmatikte aynı):
  Sandık (3 karttan seç), Altın Sandık (2 seçim, Muhafız'ın arkasında kilitli),
  Şifa Pınarı (takımı iyileştirir, düşenleri kaldırır), Kan Sunağı (pusu, yenince herkese 2 seçim),
  Enerji Kulesi (alanda şarj ol, XP yağmuru), Savaş Totemi (45 sn hasar/atış hızı).
- **Haritada bosslar:** 3 uyuyan **Muhafız** (4 farklı saldırı seti). Yaklaşınca ya da vurulunca
  uyanırlar, herkes uzaklaşırsa geri uyuyup iyileşirler. Öldürünce herkese 2 seçim, kalpler ve altın
  sandığın kilidi. Dalga bitişini beklemezler: isteğe bağlıdırlar.
- **Silahlar (9):** Kıvılcım, Saçma, İğne Yağmuru, Ray Topu (anlık delici ışın), Roketatar
  (alan hasarı), Ay Bıçağı (geri dönen), Şimşek (zincirleme), Ejder Nefesi (tutuşturan alev),
  Avcı Sürüsü (güdümlü). Her biri I–IV arası yükseltilebilir, en fazla 4 silah taşınır.
- **Yetenekler (18):** can, hız, hasar, atış hızı, çoklu mermi, delme, kritik, can emme, mıknatıs,
  zırh, yenilenme, atılma bekleme süresi, atılma şok dalgası, yörünge bıçakları, patlayan
  ölüler, sekme, yavaşlatma, menzil.
- **Düşmanlar:** Sürüngen, Sinek (sürü), Tükürgen (menzilli), Kaya (hücumcu), Bombacı,
  Ok (çizgi atılması), Bölünen + Yavru, Fırıldak (halka mermi), elit varyantlar ve boss.

### Kontroller

| | Klavye + Fare | Gamepad | Dokunmatik |
|---|---|---|---|
| Hareket | WASD / oklar | Sol analog | Ekranın sol yarısında sürükle |
| Nişan | Fare | Sağ analog (bırakınca otomatik) | Sağ yarıda sürükle (yoksa otomatik) |
| Atılma | Boşluk / Shift / sağ tık | A / RB / LB / tetikler | ATIL düğmesi |
| Menü | Esc / P | Start | ❚❚ düğmesi |

Silahlar otomatik ateş eder. Atılma sırasında dokunulmazsın.

## Testler / araçlar

```bash
node tools/simtest.mjs 4          # headless: 4 bot ile tüm koşuyu simüle eder
node tools/balance.mjs 10 1       # zorluk ölçümü: kaçan bot ile 10 koşu
node tools/smoke.mjs out/         # tarayıcı smoke testi (Playwright, sunucu :8080'de açık olmalı)
node tools/cooptest.mjs out/ 2    # host + 2 istemci gerçek WebRTC co-op testi
node tools/maptest.mjs            # harita erişilebilirliği + yapı/Muhafız mantığı
node tools/nettest.mjs            # snapshot kodlama + istemci tahmini
node tools/make-icons.mjs         # icons/icon.svg'den PNG ikonları üretir
```

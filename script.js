// 1. 初始化地圖 (先設定一個預設中心點，這裡設為高雄四維行政中心)
// 語法：L.map('你設定的 div id').setView([緯度, 經度], 縮放層級);
const map = L.map('map').setView([22.6208, 120.3118], 15);

// 2. 載入地圖圖層 (這裡使用免費開源的 OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// 用來裝所有車位標記的群組，方便之後清除重新繪製
let markersGroup = L.layerGroup().addTo(map);

// 3. 取得目前位置並開始找車位的主流程
function initApp() {
  console.log("正在請求使用者位置授權...");
  
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // 成功取得授權
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;
        
        console.log(`取得位置: ${userLat}, ${userLon}`);
        
        // 將地圖中心移動到使用者所在位置，並放大
        map.flyTo([userLat, userLon], 16);
        
        // 畫一個特殊的藍色標記，代表「你在這裡」
        L.marker([userLat, userLon]).addTo(map)
          .bindPopup("<b>你的位置</b>").openPopup();

        // 呼叫我們的 Vercel API 尋找附近的車位 (假設半徑 500 公尺)
        await fetchAndDrawParkingSpaces(userLat, userLon, 500);
      },
      (error) => {
        console.error("無法取得位置:", error);
        alert("無法取得您的位置，請確認瀏覽器已開啟定位權限。");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000 // 10秒超時
      }
    );
  } else {
    alert("您的瀏覽器不支援地理位置功能。");
  }
}

// 4. 呼叫我們自製的後端 API 並在地圖上畫出車位
async function fetchAndDrawParkingSpaces(lat, lon, radius) {
  try {
    console.log("開始呼叫 /api/parking...");
    
    // 這裡呼叫的正是你剛才用 vercel dev 測試成功的 API 端點
    // 我們將使用者取得的經緯度傳送給後端
    const response = await fetch(`/api/parking?lat=${lat}&lon=${lon}&radius=${radius}&city=Kaohsiung`);
    const data = await response.json();
    
    console.log(`成功拿到 ${data.length} 筆車位資料`, data);
    
    // 清除舊的標記
    markersGroup.clearLayers();

    // 將回傳的陣列一筆一筆畫上地圖
    data.forEach(space => {
      // 解析 API 回傳的坐標字串 (TDX 格式通常為 "POINT(經度 緯度)")
      // 利用正則表達式把數字抓出來
      const match = space.Geometry.match(/POINT \((\d+\.\d+) (\d+\.\d+)\)/);
      if (match) {
        // 注意：Leaflet 使用 [緯度, 經度]，但 WKT 格式是 POINT(經度 緯度)
        const spaceLon = parseFloat(match[1]); 
        const spaceLat = parseFloat(match[2]); 
        
        // 根據狀態設定顏色
        // 0: 空車位 (綠色), 1: 已佔用 (紅色), 2: 狀態不明 (灰色)
        let color = 'gray';
        let statusText = '狀態不明 (無感測器)';
        if (space.ServiceStatus === 0) { color = 'green'; statusText = '🟢 可停'; }
        if (space.ServiceStatus === 1) { color = 'red'; statusText = '🔴 已佔用'; }

        // 畫圓形標記
        const marker = L.circleMarker([spaceLat, spaceLon], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        });
        
        // --- 核心導航按鈕 ---
        // 組裝 Google Maps 導航 URL (使用 destination 參數)
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${spaceLat},${spaceLon}`;
        
        // 彈出視窗 (Popup) 的 HTML 內容
        const popupContent = `
          <div style="font-family: sans-serif;">
            <h3 style="margin: 0 0 5px 0;">${space.ParkingSpotID}</h3>
            <p style="margin: 0 0 10px 0;">目前狀態：<strong>${statusText}</strong></p>
            <a href="${navUrl}" target="_blank" style="
              display: block; 
              background: #4285F4; 
              color: white; 
              text-align: center; 
              padding: 8px 0; 
              text-decoration: none; 
              border-radius: 4px;
              font-weight: bold;
            ">📍 開啟 Google 導航</a>
          </div>
        `;
        
        marker.bindPopup(popupContent);
        markersGroup.addLayer(marker);
      }
    });

  } catch (error) {
    console.error("載入車位資料失敗:", error);
    alert("載入車位資料時發生錯誤，請稍後再試。");
  }
}

// 啟動應用程式
initApp();
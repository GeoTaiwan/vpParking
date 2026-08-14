export default async function handler(req, res) {
  // 1. 接收前端傳來的網址參數 (例如: /api/parking?lat=22.6208&lon=120.3118)
  const { lat = 22.6208, lon = 120.3118, radius = 500, city = 'Kaohsiung' } = req.query;

  // 2. 從 Vercel 環境變數讀取密碼 (絕對不會外洩到前端)
  const CLIENT_ID = process.env.TDX_CLIENT_ID;
  const CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;
  console.log("檢查密碼是否有讀到：", CLIENT_ID, CLIENT_SECRET);
  try {
    // 3. 向 TDX 取得 Token
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'client_credentials');
    tokenParams.append('client_id', CLIENT_ID);
    tokenParams.append('client_secret', CLIENT_SECRET);

    const tokenRes = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // 4. 同時呼叫靜態與動態停車 API
    const fetchOptions = { headers: { 'Authorization': `Bearer ${token}` } };
    // 💡 修正 1：依照 TDX 文件，正確的路徑為 ParkingSpot 與 ParkingSpotAvailability
    const staticApiUrl = `https://tdx.transportdata.tw/api/basic/v1/Parking/OnStreet/ParkingSpot/City/${city}?%24spatialFilter=nearby(${lat},${lon},${radius})&%24format=JSON`;
    const dynamicApiUrl = `https://tdx.transportdata.tw/api/basic/v1/Parking/OnStreet/ParkingSpotAvailability/City/${city}?%24spatialFilter=nearby(${lat},${lon},${radius})&%24format=JSON`;

    const [staticResponse, dynamicResponse] = await Promise.all([
      fetch(staticApiUrl, fetchOptions),
      fetch(dynamicApiUrl, fetchOptions)
    ]);

    // 🛡️ 新增這段防護網：如果 TDX 沒有回傳 200 OK，就直接把錯誤印出來，不要硬轉 JSON
    if (!staticResponse.ok || !dynamicResponse.ok) {
      const errorText1 = await staticResponse.text();
      const errorText2 = await dynamicResponse.text();
      console.error("TDX 回傳了錯誤訊息：", errorText1, errorText2);
      throw new Error("向 TDX 請求資料失敗");
    }

    const staticData = await staticResponse.json();
    const dynamicData = await dynamicResponse.json();


    
    // 5. 資料整併邏輯
    // 💡 修正 2：加強資料整併邏輯，相容不同的欄位名稱
    const staticList = Array.isArray(staticData) ? staticData : (staticData.ParkingSpots || []);
    const dynamicList = Array.isArray(dynamicData) ? dynamicData : (dynamicData.ParkingSpots || []);

    const dynamicStatusMap = {};
    dynamicList.forEach(item => {
      // 兼容 SpaceID 或 ParkingSpaceID
      const id = item.ParkingSpotID;
      if (id) dynamicStatusMap[id] = item.ServiceStatus;
    });

    const mergedData = staticList.map(space => {
      const id = space.SpaceID || space.ParkingSpaceID;
      return {
        ...space,
        SpaceID: id, // 統一補上一個乾淨的 ID 欄位給前端使用
        ServiceStatus: dynamicStatusMap[id] ?? 2 
      };
    });
    
    

    // 6. 將整理好的乾淨資料回傳給前端
    res.status(200).json(mergedData);

  } catch (error) {
    console.error('API 發生錯誤:', error);
    res.status(500).json({ error: '伺服器獲取停車資料失敗' });
  }
}
export default async function handler(req, res) {
    // 1. 接收前端傳來的網址參數 (例如: /api/parking?lat=22.6208&lon=120.3118)
    const { lat = 22.6208, lon = 120.3118, radius = 500, city = 'Kaohsiung' } = req.query;

    // 2. 從 Vercel 環境變數讀取密碼 (絕對不會外洩到前端)
    const CLIENT_ID = process.env.TDX_CLIENT_ID;
    const CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;
    console.log('TDX Client ID:', CLIENT_ID);
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

        // 使用 $spatialFilter 讓 TDX 直接回傳指定半徑內的車位
        const staticApiUrl = `https://tdx.transportdata.tw/api/basic/v1/Parking/OnStreet/ParkingSpot/City/${city}?%24spatialFilter=nearby(${lat},${lon},${radius})&%24format=JSON`;
        const dynamicApiUrl = `https://tdx.transportdata.tw/api/basic/v1/Parking/OnStreet/ParkingSpotAvailability/City/${city}?%24format=JSON`;

        const [staticResponse, dynamicResponse] = await Promise.all([
            fetch(staticApiUrl, fetchOptions),
            fetch(dynamicApiUrl, fetchOptions)
        ]);

        // 🛡️ 防護網：檢查 TDX API 是否回傳正常狀態
        if (!staticResponse.ok || !dynamicResponse.ok) {
            const errorText1 = await staticResponse.text();
            const errorText2 = await dynamicResponse.text();
            console.error("TDX 回傳錯誤：", errorText1, errorText2);
            throw new Error("向 TDX 請求資料失敗");
        }

        const staticData = await staticResponse.json();
        const dynamicData = await dynamicResponse.json();

        // 5. 資料整併邏輯 (針對 TDX 真實 JSON 結構進行修正)

        // 提取陣列，若查無資料或回傳空物件則給予空陣列作為預設值
        const staticList = staticData.ParkingSegmentSpots || [];
        const dynamicList = dynamicData.CurbSpotParkingAvailabilities || [];

        // 建立動態狀態字典，以 ParkingSpotID 為 Key
        const dynamicStatusMap = {};
        dynamicList.forEach(item => {
            if (item.ParkingSpotID) {
                // 取 SpotStatus (1:可停空位, 2:已被停滿)
                dynamicStatusMap[item.ParkingSpotID] = item.SpotStatus;
            }
        });

        // 將動態狀態合併進靜態座標資料中
        const mergedData = staticList.map(space => {
            const id = space.ParkingSpotID;
            return {
                ...space,
                // 若找不到動態狀態，預設為 0 (未知狀態) 以利前端判斷
                SpotStatus: dynamicStatusMap[id] ?? 0
            };
        });

        // 6. 將整理好的乾淨資料回傳給前端
        res.status(200).json(mergedData);

    } catch (error) {
        console.error('API 發生錯誤:', error);
        res.status(500).json({ error: '伺服器獲取停車資料失敗' });
    }
}
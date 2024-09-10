const express = require('express');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const { User } = require("./models/User.js");
const app = express();
const cors = require('cors');

const JWT_SECRET = 'your-secret-key'; // 비밀 키 (환경 변수로 설정하는 것이 좋습니다)

// MongoDB 연결
connectDB();
app.use(cors({
  origin: '*', // CORS 설정 시 도메인과 포트 일치
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 200,
}));
app.use(express.json());

app.listen(8864, () => {
  console.log('listening to http://localhost:8864');
});

// 로그인
app.post("/api/users/login", async (req, res) => {
  try {
    // DB에서 요청한 username 찾기
    const user = await User.findOne({ username: req.body.username });
    if (!user) {
      return res.json({
        loginSuccess: false,
        message: "Username을 다시 확인하세요.",
      });
    }
    
    // DB에서 요청한 username이 있다면 비밀번호가 같은지 확인
    const isMatch = await user.comparePassword(req.body.password);
    if (!isMatch) {
      return res.json({
        loginSuccess: false,
        message: "비밀번호가 틀렸습니다",
      });
    }
    
    // JWT 생성
    const token = jwt.sign(
      { userId: user._id, username: user.username, phoneNumber: user.phoneNumber },
      JWT_SECRET,
      { expiresIn: '1h' } // 토큰 유효 기간
    );

    res.status(200).json({ loginSuccess: true, token });
  } catch (err) {
    console.error('로그인 실패:', err);
    res.status(400).send(err);
  }
});

// 회원가입
app.post('/api/users/signup', async (req, res) => {
  try {
    const user = new User(req.body);
    const userInfo = await user.save(); // async/await 사용
    const token = jwt.sign({ userId: userInfo._id }, 'your-secret-key', { expiresIn: '1h' }); // JWT 생성
    console.log('회원가입 성공:', userInfo); // 회원가입 성공 시 사용자 정보를 콘솔에 출력
    return res.status(200).json({ success: true, token }); // JWT를 포함하여 응답
  } catch (err) {
    console.error('회원가입 실패:', err);
    return res.status(500).json({ success: false, err });
  }
});

// 사용자 정보 조회
app.get('/api/users/userinfo', async (req, res) => {
  try {
    // Authorization 헤더에서 JWT 추출
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1]; // Bearer 토큰에서 실제 토큰 추출
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // JWT 검증
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // 토큰에서 사용자 정보 가져오기
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.status(200).json({ success: true, username: user.username, phoneNumber: user.phoneNumber });
    });
  } catch (err) {
    console.error('사용자 정보 조회 실패:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
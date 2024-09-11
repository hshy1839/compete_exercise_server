const express = require('express');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const { User } = require("./models/User.js");
const { Planning } = require('./models/Planning.js');
const bodyParser = require('body-parser');
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
app.use(bodyParser.json());

app.listen(8864, () => {
  console.log('listening to http://localhost:8864');
});

// 로그인
app.post("/api/users/login", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    if (!user) {
      return res.json({
        loginSuccess: false,
        message: "Username을 다시 확인하세요.",
      });
    }
    
    const isMatch = await user.comparePassword(req.body.password);
    if (!isMatch) {
      return res.json({
        loginSuccess: false,
        message: "비밀번호가 틀렸습니다",
      });
    }
    
    const token = jwt.sign(
      { userId: user._id, username: user.username, phoneNumber: user.phoneNumber },
      JWT_SECRET,
      { expiresIn: '1h' }
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
    const userInfo = await user.save();
    const token = jwt.sign({ userId: userInfo._id }, JWT_SECRET, { expiresIn: '1h' });
    console.log('회원가입 성공:', userInfo);
    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error('회원가입 실패:', err);
    return res.status(500).json({ success: false, err });
  }
});

// 사용자 정보 조회
app.get('/api/users/userinfo', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Debugging output
      console.log('User birthdate:', user.birthdate); // Check if birthdate is null or valid

      // Format birthdate to ISO 8601 string if it's not null
      const birthdate = user.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : null;

      res.status(200).json({
        success: true,
        username: user.username, 
        phoneNumber: user.phoneNumber,
        birthdate: birthdate, // formatted birthdate
        name: user.name, 
      });
    });
  } catch (err) {
    console.error('사용자 정보 조회 실패:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// 운동 계획 추가
app.post('/api/users/planning', async (req, res) => {
  try {
    const { selected_date, selected_exercise, selected_participants, selected_startTime, selected_endTime, selected_location } = req.body;

    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // 운동 계획 저장
    const planning = new Planning({
      userId,
      selected_date,
      selected_exercise,
      selected_participants,
      selected_startTime,
      selected_endTime,
      selected_location
    });

    await planning.save();
    res.status(200).json({ success: true, message: '운동 계획이 성공적으로 저장되었습니다.' });
  } catch (err) {
    console.error('운동 계획 저장 실패:', err);
    res.status(500).json({ success: false, message: '운동 계획 저장 실패' });
  }
});


// 운동 계획 조회
app.get('/api/users/planinfo', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      console.log('Decoded User ID:', decoded.userId); // 디버그용 로그

      // 모든 사용자의 운동 계획 조회
      const plans = await Planning.find({});
      if (!plans || plans.length === 0) {
        return res.status(404).json({ success: false, message: 'No planning found' });
      }

      // 계획이 여러 개일 수 있으므로 배열로 응답
      res.status(200).json({
        success: true,
        plans: await Promise.all(plans.map(async (plan) => {
          const user = await User.findById(plan.userId).select('username');
          return {
            username: user ? user.username : 'Unknown User',
            selected_date: plan.selected_date,
            selected_startTime: plan.selected_startTime,
            selected_endTime: plan.selected_endTime,
            selected_participants: plan.selected_participants,
            selected_exercise: plan.selected_exercise,
            selected_location: plan.selected_location,
          };
        })),
      });
    });
  } catch (err) {
    console.error('계획 정보 조회 실패:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

const express = require('express');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const { User } = require("./models/User.js");
const { Planning } = require('./models/Planning.js');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');


const JWT_SECRET = 'your-secret-key'; // 비밀 키 (환경 변수로 설정하는 것이 좋습니다)

// MongoDB 연결
connectDB();
app.use(cors({
  origin: '*', // CORS 설정 시 도메인과 포트 일치
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
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

    // 중복 키 에러 처리
    if (err.code === 11000) {
      // 중복된 필드명 추출
      const duplicatedField = Object.keys(err.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `이미 사용 중인 ${duplicatedField}입니다.`,
      });
    }

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

       // Format birthdate to ISO 8601 string if it's not null
      const birthdate = user.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : null;

      res.status(200).json({
        success: true,
        username: user.username, 
        nickname: user.nickname,
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

      try {
        // 모든 사용자의 운동 계획 조회
        const plans = await Planning.find({});
        if (!plans || plans.length === 0) {
          return res.status(404).json({ success: false, message: 'No planning found' });
        }

        // 계획이 여러 개일 수 있으므로 배열로 응답
        const plansWithUserDetails = await Promise.all(plans.map(async (plan) => {
          const user = await User.findById(plan.userId).select('nickname'); // 'nickname'을 정확히 선택합니다.
          return {
            _id: plan._id,
            nickname: user ? user.nickname : 'Unknown User', // 'nickname'으로 변경
            selected_date: plan.selected_date,
            selected_startTime: plan.selected_startTime,
            selected_endTime: plan.selected_endTime,
            selected_participants: plan.selected_participants,
            selected_exercise: plan.selected_exercise,
            selected_location: plan.selected_location,
          };
        }));

        return res.status(200).json({ success: true, plans: plansWithUserDetails });
      } catch (fetchError) {
        console.error('계획 정보 조회 실패:', fetchError);
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }
    });
  } catch (err) {
    console.error('계획 정보 조회 실패:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// 사용자 정보 수정
app.put('/api/users/userinfo', async (req, res) => {
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

      const userId = decoded.userId;
      const { name, nickname, phoneNumber, birthdate } = req.body;

      // 사용자 정보 업데이트
      const user = await User.findByIdAndUpdate(
        userId,
        { name, nickname, phoneNumber, birthdate },
        { new: true } // 업데이트된 사용자 정보를 반환
      );

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.status(200).json({
        success: true,
        message: 'User information updated successfully',
        user: {
          name: user.name,
          nickname: user.nickname,
          phoneNumber: user.phoneNumber,
          birthdate: user.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : null,
        },
      });
    });
  } catch (err) {
    console.error('사용자 정보 수정 실패:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 닉네임 검색 라우트
app.get('/api/users/search', async (req, res) => {
  const nickname = req.query.nickname;
  
  // 사용자 인증 토큰 처리
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // JWT 검증
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId; // 현재 로그인한 사용자 ID

    // 사용자 검색
    const users = await User.find({ nickname: { $regex: nickname, $options: 'i' } }); // 대소문자 구분 없이 검색

    // 현재 사용자가 팔로우하고 있는 사용자 목록을 가져옴
    const currentUser = await User.findById(userId);
    const followingIds = currentUser.following.map(id => id.toString()); // string 형태로 변환

    // 결과에 팔로우 여부 추가
    const result = users.map(user => {
      return {
        _id: user._id,
        nickname: user.nickname,
        isFollowing: followingIds.includes(user._id.toString()) // 팔로우 여부
      };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('사용자 검색 실패:', error);
    res.status(500).send('Error fetching users');
  }
});


// 운동 계획 삭제

app.delete('/api/users/planning/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // 요청 파라미터에서 운동 계획 ID 추출
    const planId = req.params.id;

    // 해당 계획을 완전히 삭제
    const result = await Planning.findOneAndDelete({ _id: planId, userId });

    if (!result) {
      return res.status(404).json({ success: false, message: '운동 계획을 찾을 수 없습니다.' });
    }

    res.status(200).json({ success: true, message: '운동 계획이 성공적으로 삭제되었습니다.' });
  } catch (err) {
    console.error('운동 계획 삭제 실패:', err);
    res.status(500).json({ success: false, message: '운동 계획 삭제 실패' });
  }
});

// 팔로우 기능
app.post('/api/users/follow', async (req, res) => {
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

      const { nickname } = req.body; // 팔로우할 사용자 닉네임

      // 닉네임으로 사용자 찾기
      const targetUser = await User.findOne({ nickname });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Target user not found' });
      }

      // 이미 팔로우하고 있는지 확인
      if (user.following.includes(targetUser._id)) {
        return res.status(400).json({ success: false, message: 'Already following this user' });
      }

      // 팔로우 관계 저장
      user.following.push(targetUser._id);
      targetUser.followers.push(user._id);

      await user.save();
      await targetUser.save();

      res.status(200).json({ success: true, message: 'Followed successfully' });
    });
  } catch (err) {
    console.error('팔로우 요청 처리 실패:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});




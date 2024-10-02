const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const connectDB = require('./db');
const { User } = require("./models/User.js");
const { Planning } = require('./models/Planning.js');
const Message = require('./models/message.js');
const ChatRoom = require('./models/ChatRoom.js');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const JWT_SECRET = 'your-secret-key'; // 비밀 키 (환경 변수로 설정하는 것이 좋습니다)

// MongoDB 연결
connectDB();

// HTTP 서버 생성
const server = http.createServer(app);
const io = new Server(server);

// CORS 설정
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

io.on('connection', (socket) => {
  console.log('새로운 클라이언트 연결:', socket.id);

  // 새로운 채팅방 생성 이벤트 처리
  socket.on('createChatRoom', async ({ senderId, receiverId }) => {
    try {
      // 참가자들이 이미 있는 채팅방이 존재하는지 확인
      let chatRoom = await ChatRoom.findOne({
        participants: { $all: [senderId, receiverId] },
      });
      // 채팅방이 없으면 생성
      if (!chatRoom) {
        chatRoom = new ChatRoom({
          participants: [senderId, receiverId],
        });
        await chatRoom.save();
      }

      // 클라이언트에게 채팅방 ID 전달
      socket.emit('chatRoomCreated', { chatRoomId: chatRoom._id });
      console.log(`채팅방 생성됨: ${chatRoom._id}`);
    } catch (err) {
      console.error('채팅방 생성 중 오류:', err);
      socket.emit('error', '채팅방을 생성할 수 없습니다.');
    }
  });

  // 채팅방 나가기 이벤트 처리
  socket.on('leaveChatRoom', ({ chatRoomId }) => {
    try {
      // 클라이언트가 채팅방을 나가게 처리
      socket.leave(chatRoomId);
      console.log(`클라이언트 ${socket.id}가 채팅방 ${chatRoomId}에서 나갔습니다.`);

      // 클라이언트에게 채팅방 나감 확인
      socket.emit('chatRoomLeft', { chatRoomId });
    } catch (err) {
      console.error('채팅방 나가는 중 오류:', err);
      socket.emit('error', '채팅방을 나갈 수 없습니다.');
    }
  });

// 기존 메시지 처리
socket.on('joinChatRoom', async ({ chatRoomId, senderId }) => {
  try {
    // 채팅방에 참여
    socket.join(chatRoomId);
    console.log(`클라이언트 ${senderId}가 채팅방 ${chatRoomId}에 참여했습니다.`);

    // 기존 메시지 가져오기
    const messages = await Message.find({ chatRoomId })
      .populate('senderId', 'username');

    // 클라이언트에게 기존 메시지 전송
    const formattedMessages = messages.map(message => ({
      _id: message._id,
      senderId: message.senderId._id.toString(), // ObjectId를 문자열로 변환
      message: message.message,
      chatRoomId: message.chatRoomId,
    }));

    socket.emit('existingMessages', formattedMessages);
  } catch (err) {
    console.error('채팅방 참여 중 오류:', err);
    socket.emit('error', '채팅방에 참여할 수 없습니다.');
  }
});

// 메시지 수신 이벤트
socket.on('sendMessage', async ({ chatRoomId, senderId, receiverId, message }) => {
  try {
    const newMessage = new Message({
      senderId,
      receiverId,
      message,
      chatRoomId,
      timestamp: new Date().toISOString(), // 타임스탬프를 ISO 문자열로 변환
    });
    await newMessage.save();

    // 특정 채팅방에 메시지 전송
    const formattedMessage = {
      _id: newMessage._id,
      senderId: newMessage.senderId.toString(),
      message: newMessage.message,
      chatRoomId: newMessage.chatRoomId,
      timestamp: newMessage.timestamp, // 타임스탬프 포함
    };

    io.to(chatRoomId).emit('receiveMessage', formattedMessage);
  } catch (err) {
    console.error('메시지 전송 중 오류:', err);
  }
});

 // 운동 계획 조회
 socket.on('getExercisePlans', async (token) => {
  try {
    if (!token) {
      socket.emit('exercisePlansResponse', { success: false, message: 'Unauthorized' });
      return;
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        socket.emit('exercisePlansResponse', { success: false, message: 'Unauthorized' });
        return;
      }

      try {
        // 모든 사용자의 운동 계획 조회
        const plans = await Planning.find({});
        if (!plans || plans.length === 0) {
          socket.emit('exercisePlansResponse', { success: false, message: 'No planning found' });
          return;
        }

        // 계획이 여러 개일 수 있으므로 배열로 응답
        const plansWithUserDetails = await Promise.all(plans.map(async (plan) => {
          const user = await User.findById(plan.userId).select('nickname');
          return {
            _id: plan._id,
            userId: plan.userId,
            nickname: user ? user.nickname : 'Unknown User',
            selected_date: plan.selected_date,
            selected_startTime: plan.selected_startTime,
            selected_endTime: plan.selected_endTime,
            selected_participants: plan.selected_participants,
            selected_exercise: plan.selected_exercise,
            selected_location: plan.selected_location,
            participants: plan.participants,
          };
        }));

        // 클라이언트에 응답
        socket.emit('exercisePlansResponse', { success: true, plans: plansWithUserDetails });
      } catch (fetchError) {
        console.error('계획 정보 조회 실패:', fetchError);
        socket.emit('exercisePlansResponse', { success: false, message: 'Internal server error' });
      }
    });
  } catch (err) {
    console.error('계획 정보 조회 실패:', err);
    socket.emit('exercisePlansResponse', { success: false, message: 'Internal server error' });
  }
});


  // 클라이언트 연결 해제 이벤트
  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제:', socket.id);
  });
});

// 서버 시작
server.listen(8864, () => {
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

      const user = await User.findById(decoded.userId)
        .populate('followers')  // 팔로워 정보 포함
        .populate('following');  // 팔로잉 정보 포함

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Format birthdate to ISO 8601 string if it's not null
      const birthdate = user.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : null;

      res.status(200).json({
        _id: user._id,
        success: true,
        username: user.username,
        nickname: user.nickname,
        phoneNumber: user.phoneNumber,
        birthdate: birthdate, // formatted birthdate
        name: user.name,
        postCount: user.posts ? user.posts.length : 0, // 게시물 수
        followersCount: user.followers.length, // 팔로워 수
        followingCount: user.following.length, // 팔로잉 수
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




// 운동 계획 참여
app.post('/api/users/participate/:planId', async (req, res) => {
  console.log('요청 수신됨:', req.params, req.body); // 요청 로그 추가
  const planId = req.params.planId;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET);
  const userId = decoded.userId; // 현재 로그인한 사용자의 ID를 가져옴

  try {
    const plan = await Planning.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: '운동 계획을 찾을 수 없습니다.' });
    }

    // 사용자가 자신의 계획에 참여할 수 없도록 검사
    if (plan.userId.toString() === userId) {
      return res.status(403).json({ message: '본인의 계획에는 참여할 수 없습니다.' });
    }

    if (plan.participants.includes(userId)) {
      return res.status(400).json({ message: '이미 참여하고 있는 계획입니다.' });
    }

    plan.participants.push(userId);
    await plan.save();

    res.status(200).json({ message: '참여 요청이 성공적으로 처리되었습니다.' });
  } catch (error) {
    console.error('운동 계획 참여 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류' });
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

// 팔로우 취소
app.post('/api/users/deletefollow', async (req, res) => {
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

      const { nickname } = req.body; // 팔로우 취소할 사용자 닉네임

      // 닉네임으로 사용자 찾기
      const targetUser = await User.findOne({ nickname });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Target user not found' });
      }

      // 팔로우 여부 확인
      if (!user.following.includes(targetUser._id)) {
        return res.status(400).json({ success: false, message: 'You are not following this user' });
      }

      // 팔로우 취소 처리 (각각의 팔로잉 및 팔로워 목록에서 제거)
      user.following = user.following.filter(followId => followId.toString() !== targetUser._id.toString());
      targetUser.followers = targetUser.followers.filter(followerId => followerId.toString() !== user._id.toString());

      // 변경 사항 저장
      await user.save();
      await targetUser.save();

      res.status(200).json({ success: true, message: 'Unfollowed successfully' });
    });
  } catch (err) {
    console.error('팔로우 취소 요청 처리 실패:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
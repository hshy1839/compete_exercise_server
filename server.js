const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const connectDB = require('./db');
const { User } = require("./models/User.js");
const { Planning } = require('./models/Planning.js');
const Message = require('./models/message.js');
const ChatRoom = require('./models/ChatRoom.js');
const Notification = require('./models/Notification.js');
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


  //알림 모듈
  const sendNotification = async (userId, message) => {
    try {
        // userId로 User 모델에서 nickname 조회
        const user = await User.findById(userId);
        
        if (!user) {
            console.error('사용자를 찾을 수 없습니다:', userId);
            return;
        }

        // nickname으로 알림 메시지 저장
        const notificationMessage = `${message}`;
        const notification = new Notification({ userId, message: notificationMessage });
        
        await notification.save();
        console.log(`알림 전송됨: ${notificationMessage} to userId: ${userId}, \n notification: ${notification}`);
    } catch (error) {
        console.error('알림 전송 중 오류 발생:', error);
    }
};

// 클라이언트의 사용자 ID를 받아서 알림을 조회하는 이벤트
socket.on('requestNotifications', async (userId) => {
    try {
        // 특정 사용자 ID와 일치하는 알림 조회
        const notifications = await Notification.find({ userId });

        // 클라이언트에 알림 전송
        socket.emit('receiveNotifications', notifications);
    } catch (error) {
        console.error('알림 조회 중 오류 발생:', error);
    }
});

  
  

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


  // 운동 계획 참여 
socket.on('participateInPlan', async ({ planId, userId }) => {
  console.log('참여 요청 수신됨:', { planId, userId });

  try {
      const plan = await Planning.findById(planId);
      if (!plan) {
          socket.emit('participateResponse', { success: false, message: '운동 계획을 찾을 수 없습니다.' });
          return;
      }

      // 사용자가 자신의 계획에 참여할 수 없도록 검사
      if (plan.userId.toString() === userId) {
          socket.emit('participateResponse', { success: false, message: '본인의 계획에는 참여할 수 없습니다.' });
          return;
      }

      if (plan.participants.includes(userId)) {
          socket.emit('participateResponse', { success: false, message: '이미 참여하고 있는 계획입니다.' });
          return;
      }

      plan.participants.push(userId);
      await plan.save();

      // 보낸 사용자의 닉네임 조회
      const sender = await User.findById(userId);
      if (!sender) {
          console.error('사용자를 찾을 수 없습니다:', userId);
          return;
      }

      // 알림 전송
      await sendNotification(plan.userId, `${sender.nickname}님이 당신의 운동 계획에 참여했습니다.`);
      
      // 참여 성공 후 모든 클라이언트에 운동 계획 목록 전송
      const updatedPlans = await Planning.find({});
      const plansData = updatedPlans.map(plan => ({
          participants: plan.participants,
      }));

      // 모든 클라이언트에 업데이트된 계획 전송
      io.emit('exercisePlansResponse', { success: true, plans: plansData });
      socket.emit('participateResponse', { success: true, message: '참여 요청이 성공적으로 처리되었습니다.' });
  } catch (error) {
      console.error('운동 계획 참여 중 오류 발생:', error);
      socket.emit('participateResponse', { success: false, message: '서버 오류' });
  }
});


// 운동 계획 해제
socket.on('leave_plan', async ({ userId, planId }) => {
  try {
      // 계획에서 참여자 목록에서 사용자 ID 제거
      await Planning.findByIdAndUpdate(planId, {
          $pull: { participants: userId },
      });

      // 사용자에게 해당 계획에 대한 정보 업데이트
      const updatedPlan = await Planning.findById(planId);
      io.emit('plan_updated', updatedPlan);

      // 보낸 사용자의 닉네임 조회
      const sender = await User.findById(userId);
      if (!sender) {
          console.error('사용자를 찾을 수 없습니다:', userId);
          return;
      }

      // 알림 메시지 생성
      const notificationMessage = `${sender.nickname}님이 계획에서 참여를 해제했습니다.`;
      
      // 모든 참여자에게 알림 전송
      const planOwnerId = updatedPlan.userId; // 현재 계획의 작성자 ID

      await sendNotification(planOwnerId, notificationMessage);

      // 클라이언트에 성공 메시지 전송
      socket.emit('leave_plan_success', {
          message: '참여 해제 성공',
          planId: planId,
      });

  } catch (error) {
      console.error('Error leaving plan:', error);
      socket.emit('leave_plan_error', {
          message: '참여 해제 실패',
      });
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
        message: "아이디를 다시 확인하세요.",
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
    console.error('회원가입 실패:', err.code, err);

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
            userId: plan.userId,
            nickname: user ? user.nickname : 'Unknown User', // 'nickname'으로 변경
            selected_date: plan.selected_date,
            selected_startTime: plan.selected_startTime,
            selected_endTime: plan.selected_endTime,
            selected_participants: plan.selected_participants,
            selected_exercise: plan.selected_exercise,
            selected_location: plan.selected_location,
            participants: plan.participants,
            isPrivate: plan.isPrivate,
            planTitle: plan.planTitle,
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

      const followerIds = user.followers.map(follower => follower._id);

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
        followers: user.followers,
        following: user.following,
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
    const { selected_date, selected_exercise, planTitle, selected_participants, selected_startTime, selected_endTime, selected_location, isPrivate, participants} = req.body;

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
      planTitle,
      selected_participants,
      selected_startTime,
      selected_endTime,
      selected_location,
      isPrivate,
      participants,
    });
    if (!participants || !Array.isArray(participants)) {
      participants = []; // 빈 배열로 설정
    }
    await planning.save();
    res.status(200).json({ success: true, message: '운동 계획이 성공적으로 저장되었습니다.' });
  } catch (err) {
    console.error('운동 계획 저장 실패:', err);
    res.status(500).json({ success: false, message: '운동 계획 저장 실패' });
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

// 사용자 아이디로 정보 조회
app.get('/api/users/userinfo/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const userDetails = await User.findById(userId);
    if (!userDetails) {
      return res.status(404).json({ message: '운동 계획을 찾을 수 없습니다.' });
    }

      res.status(200).json({
        nickname: userDetails.nickname,
        phoneNumber: userDetails.phoneNumber,
        birthdate: userDetails.birthdate, // formatted birthdate
        name: userDetails.name,
      });
  } catch (err) {
    console.error('사용자 정보 조회 실패:', err);
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

// 운동 계획 세부정보 조회
app.get('/api/users/planinfo/:planId', async (req, res) => {
  const { planId } = req.params; // URL 파라미터에서 planId 가져오기
  
  try {
    const planDetails = await Planning.findById(planId); // planId로 운동 계획 찾기
    const user = await User.findById(planDetails.userId).select('nickname');
    if (!planDetails) {
      return res.status(404).json({ message: '운동 계획을 찾을 수 없습니다.' });
    }

    // 필요한 형식으로 응답 데이터 준비
    const response = {
      nickname: user ? user.nickname : 'Unknown User',
      selected_exercise: planDetails.selected_exercise,
      selected_date: planDetails.selected_date,
      selected_startTime: planDetails.selected_startTime,
      selected_endTime: planDetails.selected_endTime,
      selected_location: planDetails.selected_location,
      participants: planDetails.participants, // 참여 인원 배열
      selected_participants: planDetails.selected_participants,
    };

    return res.status(200).json(response); // 성공적으로 응답 반환
  } catch (error) {
    console.error('운동 계획 정보 가져오는 중 오류 발생:', error);
    return res.status(500).json({ message: '서버 오류' });
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








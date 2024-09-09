const express = require('express');
const connectDB = require('./db');
const { User } = require("./models/User.js");
const app = express();
const cors = require('cors');

// MongoDB 연결
connectDB();
app.use(cors());
app.use(express.json());

app.listen(8864, () => {
  console.log('listening to http://localhost:8864');
});

//로그인
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
      
      // 비밀번호가 맞다면 Token 생성
      const token = await user.generateToken();
      
      // 생성된 토큰을 쿠키에 저장
      res
          .cookie("hasVisited", token)
          .status(200)
          .json({ loginSuccess: true, userId: user._id });
  } catch (err) {
      console.error('로그인 실패:', err);
      res.status(400).send(err);
  }
});

//회원가입
app.post('/api/users/signup', async (req, res) => {
  try {
    const user = new User(req.body);
    const userInfo = await user.save(); // async/await 사용
    console.log('회원가입 성공:', userInfo); // 회원가입 성공 시 사용자 정보를 콘솔에 출력
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('회원가입 실패:', err);
    return res.status(500).json({ success: false, err });
  }
});

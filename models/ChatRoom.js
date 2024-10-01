const mongoose = require('mongoose');

// 메시지 스키마 정의
const chatRoomSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // 유저 컬렉션과 연결
        required: true,
      }],
      createdAt: {
        type: Date,
        default: Date.now, // 생성 시점 자동 기록
      },
    });
    

// 메시지 모델 생성
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

// 모델을 외부로 내보냄
module.exports = ChatRoom;

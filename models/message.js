const mongoose = require('mongoose');

// 메시지 스키마 정의
const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId, // 사용자의 고유 ID
    required: true,
    ref: 'User' // 사용자 모델을 참조
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId, // 수신자의 고유 ID
    required: true,
    ref: 'User' // 사용자 모델을 참조
  },
  message: {
    type: String, // 메시지 내용
    required: true
  },
  timestamp: {
    type: Date, // 메시지 전송 시간
    default: Date.now // 기본값으로 현재 시간
  },
  chatRoomId: {
    type: mongoose.Schema.Types.ObjectId, // 채팅방의 고유 ID
    required: true,
    ref: 'ChatRoom' // 채팅방 모델을 참조
  }
});

// 메시지 모델 생성
const Message = mongoose.model('Message', messageSchema);

// 모델을 외부로 내보냄
module.exports = Message;

const mongoose = require("mongoose");

const planningSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  selected_date: {
    type: Date,
    required: true
  },
  selected_exercise: {
    type: String,
    required: true
  },
  selected_participants: {
    type: Number,
    required: true
  },
  selected_startTime: {
    type: String, // 시간 문자열로 저장
    required: true
  },
  selected_endTime: {
    type: String, // 시간 문자열로 저장
    required: true
  },
  selected_location: {
    type: String,
    required: true
  },
  participants: { // 새로운 필드 추가
    type: [mongoose.Schema.Types.ObjectId], // ObjectId 배열로 설정
    ref: 'User', // User 모델 참조
    default: [], // 기본값으로 빈 배열 설정,
    unique: true,
  },
  isPrivate: {
    type: Boolean,
    required: true,
    default: false,
  },
});

const Planning = mongoose.model("Planning", planningSchema);

module.exports = { Planning };

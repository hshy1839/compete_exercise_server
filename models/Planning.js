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
  }
});

const Planning = mongoose.model("Planning", planningSchema);

module.exports = { Planning };

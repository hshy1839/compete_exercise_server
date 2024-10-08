const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' // User 모델과의 관계
    },
    message: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now // 알림 생성 시각
    },
    isRead: {
        type: Boolean,
        default: false // 알림 읽음 여부
    }
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

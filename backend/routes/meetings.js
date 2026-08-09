const express = require('express');
const MeetingService = require('../services/MeetingService');

const meetingService = new MeetingService();

module.exports = (io) => {
  const router = express.Router();

  // Create a new meeting
  router.post('/create', async (req, res) => {
    try {
      const {
        title,
        description,
        roomId,
        organizer,
        participants,
        scheduledTime,
        duration,
        settings,
        isRecurring,
        recurringSettings,
      } = req.body;

      if (!title || !roomId || !organizer || !scheduledTime) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: title, roomId, organizer, scheduledTime',
        });
      }

      const meeting = await meetingService.createMeeting({
        title,
        description,
        roomId,
        organizer,
        participants: participants || [],
        scheduledTime,
        duration: duration || 60,
        settings: {
          allowScreenShare: settings?.allowScreenShare !== false,
          allowChat: settings?.allowChat !== false,
          requirePassword: settings?.requirePassword || false,
          password: settings?.password || '',
          maxParticipants: settings?.maxParticipants || 50,
        },
        isRecurring: isRecurring || false,
        recurringSettings: recurringSettings || {},
      });

      res.status(201).json({
        success: true,
        message: 'Meeting created successfully',
        meeting: {
          id: meeting.meetingId,
          meetingId: meeting.meetingId,
          title: meeting.title,
          description: meeting.description,
          roomId: meeting.roomId,
          organizer: meeting.organizer,
          participants: meeting.participants,
          scheduledTime: meeting.scheduledTime,
          duration: meeting.duration,
          meetingUrl: `/meet/${meeting.meetingId}`,
          settings: meeting.settings,
          status: meeting.status,
          createdAt: meeting.createdAt,
        },
      });
    } catch (error) {
      console.error('Error creating meeting:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating meeting',
        error: error.message,
      });
    }
  });

  router.get('/room/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const meetings = await meetingService.getMeetingsByRoom(roomId);
      res.json(meetings);
    } catch (error) {
      console.error('Error fetching meetings:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching meetings',
        error: error.message,
      });
    }
  });

  router.get('/debug/all', async (req, res) => {
    try {
      const meetings = await meetingService.getAllMeetings();
      res.json({
        success: true,
        count: meetings.length,
        meetings,
      });
    } catch (error) {
      console.error('Error fetching all meetings:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching meetings',
        error: error.message,
      });
    }
  });

  router.get('/user/:organizer/upcoming', async (req, res) => {
    try {
      const { organizer } = req.params;
      const meetings = await meetingService.getMeetingsByOrganizer(organizer);
      const now = new Date();
      const upcoming = meetings
        .filter((m) => m.status === 'scheduled' && new Date(m.scheduledTime) >= now)
        .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
      res.json({ success: true, meetings: upcoming });
    } catch (error) {
      console.error('Error fetching upcoming meetings:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching upcoming meetings',
        error: error.message,
      });
    }
  });

  router.get('/:meetingId', async (req, res) => {
    try {
      const meeting = await meetingService.getMeetingById(req.params.meetingId);
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }
      res.json({ success: true, meeting });
    } catch (error) {
      console.error('Error fetching meeting:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching meeting',
        error: error.message,
      });
    }
  });

  router.patch('/:meetingId/status', async (req, res) => {
    try {
      const { meetingId } = req.params;
      const { status } = req.body;

      if (!['scheduled', 'active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: scheduled, active, completed, cancelled',
        });
      }

      const meeting = await meetingService.updateMeetingStatus(meetingId, status);
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }

      res.json({
        success: true,
        message: 'Meeting status updated successfully',
        meeting,
      });
    } catch (error) {
      console.error('Error updating meeting status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating meeting status',
        error: error.message,
      });
    }
  });

  router.delete('/:meetingId', async (req, res) => {
    try {
      const deleted = await meetingService.deleteMeeting(req.params.meetingId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }
      res.json({ success: true, message: 'Meeting deleted successfully' });
    } catch (error) {
      console.error('Error deleting meeting:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting meeting',
        error: error.message,
      });
    }
  });

  router.post('/:meetingId/notify', async (req, res) => {
    try {
      const { meetingId } = req.params;
      const { organizer, message } = req.body;

      const meeting = await meetingService.getMeetingById(meetingId);
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }

      const startedBy = organizer || meeting.organizer;
      const notificationText =
        message || `${startedBy} started a video meeting`;

      if (io && meeting.roomId) {
        io.to(meeting.roomId).emit('video-call-started', {
          roomId: meeting.roomId,
          startedBy,
          timestamp: new Date().toISOString(),
          meetingId,
          meetingUrl: `/meet/${meetingId}`,
        });
        io.to(meeting.roomId).emit('video-call-active', {
          roomId: meeting.roomId,
          active: true,
        });
      }

      res.json({
        success: true,
        message: 'Notification sent successfully',
        notification: {
          text: notificationText,
          meetingId,
          roomId: meeting.roomId,
          meetingUrl: `/meet/${meetingId}`,
        },
      });
    } catch (error) {
      console.error('Error sending meeting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending notification',
        error: error.message,
      });
    }
  });

  return router;
};

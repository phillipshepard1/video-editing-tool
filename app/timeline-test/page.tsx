'use client';

import { ClusterTimeline } from '@/components/timeline/ClusterTimeline';
import { ContentGroup } from '@/lib/types/takes';

// Mock data for testing the timeline
const mockContentGroups: ContentGroup[] = [
  {
    id: 'group-1',
    name: 'Opening Introduction',
    description: 'Multiple attempts at introducing the topic',
    contentType: 'introduction',
    timeRange: { start: '0:05', end: '0:45' },
    averageQuality: 7.5,
    confidence: 0.9,
    bestTakeId: 'take-1-2',
    reasoning: 'Take 2 has clearer delivery and more confident tone',
    takes: [
      {
        id: 'take-1-1',
        startTime: '0:05',
        endTime: '0:25',
        duration: 20,
        qualityScore: 6,
        confidence: 0.8,
        transcript: 'Hello everyone, welcome to... uh...',
        issues: [
          { type: 'delivery', severity: 'medium', description: 'Hesitation and filler words' }
        ],
        qualities: [
          { type: 'clear_delivery', description: 'Clear voice quality' }
        ]
      },
      {
        id: 'take-1-2',
        startTime: '0:25',
        endTime: '0:45',
        duration: 20,
        qualityScore: 9,
        confidence: 0.95,
        transcript: 'Hello everyone, welcome to today\'s session',
        issues: [],
        qualities: [
          { type: 'clear_delivery', description: 'Excellent clarity' },
          { type: 'confident_tone', description: 'Strong, confident delivery' }
        ]
      }
    ]
  },
  {
    id: 'group-2', 
    name: 'Key Concept Explanation',
    description: 'Explaining the main concept with different approaches',
    contentType: 'explanation',
    timeRange: { start: '1:15', end: '2:30' },
    averageQuality: 6.8,
    confidence: 0.85,
    bestTakeId: 'take-2-3',
    reasoning: 'Take 3 provides the clearest explanation with good pacing',
    takes: [
      {
        id: 'take-2-1',
        startTime: '1:15',
        endTime: '1:45',
        duration: 30,
        qualityScore: 5,
        confidence: 0.7,
        transcript: 'So the main idea is... well, it\'s complicated...',
        issues: [
          { type: 'content', severity: 'high', description: 'Unclear explanation' },
          { type: 'pacing', severity: 'medium', description: 'Too rushed' }
        ],
        qualities: []
      },
      {
        id: 'take-2-2',
        startTime: '1:45',
        endTime: '2:10',
        duration: 25,
        qualityScore: 7,
        confidence: 0.8,
        transcript: 'The core concept here is about understanding the relationship...',
        issues: [
          { type: 'delivery', severity: 'low', description: 'Slight monotone delivery' }
        ],
        qualities: [
          { type: 'clear_delivery', description: 'Good articulation' },
          { type: 'complete_thought', description: 'Complete explanation' }
        ]
      },
      {
        id: 'take-2-3',
        startTime: '2:10',
        endTime: '2:30',
        duration: 20,
        qualityScore: 9,
        confidence: 0.9,
        transcript: 'The fundamental principle is simple: connection drives results',
        issues: [],
        qualities: [
          { type: 'clear_delivery', description: 'Crystal clear delivery' },
          { type: 'good_pace', description: 'Perfect pacing' },
          { type: 'confident_tone', description: 'Authoritative tone' }
        ]
      }
    ]
  },
  {
    id: 'group-3',
    name: 'Closing Remarks',
    description: 'Different ways to conclude the presentation',
    contentType: 'conclusion',
    timeRange: { start: '4:45', end: '5:15' },
    averageQuality: 8.0,
    confidence: 0.88,
    bestTakeId: 'take-3-1',
    reasoning: 'Take 1 has the most impactful closing statement',
    takes: [
      {
        id: 'take-3-1',
        startTime: '4:45',
        endTime: '5:05',
        duration: 20,
        qualityScore: 9,
        confidence: 0.92,
        transcript: 'Remember, success comes from consistent action. Thank you.',
        issues: [],
        qualities: [
          { type: 'clear_delivery', description: 'Perfect clarity' },
          { type: 'confident_tone', description: 'Strong conclusion' },
          { type: 'complete_thought', description: 'Satisfying ending' }
        ]
      },
      {
        id: 'take-3-2', 
        startTime: '5:05',
        endTime: '5:15',
        duration: 10,
        qualityScore: 7,
        confidence: 0.85,
        transcript: 'That\'s all for today, thanks everyone',
        issues: [
          { type: 'energy', severity: 'low', description: 'Somewhat flat delivery' }
        ],
        qualities: [
          { type: 'clear_delivery', description: 'Clear voice' }
        ]
      }
    ]
  }
];

export default function TimelineTestPage() {
  const handleClusterDecision = (clusterId: string, takeId: string, decision: 'approve' | 'reject') => {
    console.log('Cluster decision:', { clusterId, takeId, decision });
  };

  const handleProgressToSilence = () => {
    console.log('Progress to silence timeline requested');
    alert('Great! Silence timeline coming in next phase.');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ClusterTimeline
        contentGroups={mockContentGroups}
        videoUrl="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        videoDuration={315} // 5 minutes 15 seconds
        onClusterDecision={handleClusterDecision}
        onProgressToSilence={handleProgressToSilence}
        originalFilename="test-video.mp4"
      />
    </div>
  );
}
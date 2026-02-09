import { useMemo } from 'react';
import { useStore } from '../store';

export function useCompetition() {
  const {
    competitionId,
    competitionName,
    status,
    currentEventName,
    elapsedTime,
    agents,
    leaderboard,
    actions,
    commentary,
    isConnected,
  } = useStore();

  // Get agents as sorted array by score
  const sortedAgents = useMemo(() => {
    return Object.values(agents).sort((a, b) => b.score - a.score);
  }, [agents]);

  // Get running agents count
  const runningAgentsCount = useMemo(() => {
    return Object.values(agents).filter((a) => a.status === 'running').length;
  }, [agents]);

  // Get completed agents count
  const completedAgentsCount = useMemo(() => {
    return Object.values(agents).filter((a) => a.status === 'completed').length;
  }, [agents]);

  // Get total agents count
  const totalAgentsCount = useMemo(() => {
    return Object.keys(agents).length;
  }, [agents]);

  // Get latest commentary
  const latestCommentary = useMemo(() => {
    return commentary[0] || null;
  }, [commentary]);

  // Get recent actions (last 10)
  const recentActions = useMemo(() => {
    return actions.slice(0, 10);
  }, [actions]);

  // Check if competition is active
  const isActive = status === 'running' || status === 'warmup';

  // Check if competition has ended
  const isEnded = status === 'completed';

  // Get leader
  const leader = useMemo(() => {
    if (leaderboard.length > 0) {
      return leaderboard[0];
    }
    if (sortedAgents.length > 0) {
      return sortedAgents[0];
    }
    return null;
  }, [leaderboard, sortedAgents]);

  return {
    // State
    competitionId,
    competitionName,
    status,
    currentEventName,
    elapsedTime,
    agents,
    leaderboard,
    actions,
    commentary,
    isConnected,

    // Computed
    sortedAgents,
    runningAgentsCount,
    completedAgentsCount,
    totalAgentsCount,
    latestCommentary,
    recentActions,
    isActive,
    isEnded,
    leader,
  };
}

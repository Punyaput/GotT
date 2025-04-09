const leaderboardData = [
    {
      teamName: 'Team Alpha',
      p1Name: 'Alice', p2Name: 'Bob', p3Name: '', p4Name: '',
      p1Char: 'characters/alice.png', p2Char: 'characters/bob.png', p3Char: '', p4Char: '',
      wavesReached: '12'
    },
    {
      teamName: 'Team Beta',
      p1Name: 'Charlie', p2Name: 'Diana', p3Name: 'Eve', p4Name: '',
      p1Char: 'characters/charlie.png', p2Char: 'characters/diana.png', p3Char: 'characters/eve.png', p4Char: '',
      wavesReached: '15'
    },
    {
        teamName: 'Team Beta',
        p1Name: 'Charlie', p2Name: '', p3Name: '', p4Name: '',
        p1Char: 'characters/charlie.png', p2Char: '', p3Char: '', p4Char: '',
        wavesReached: '15'
    },
    // Add more records here as needed...
  ];
  
  // Open the leaderboard modal
  function openLeaderboard() {
    document.getElementById('leaderboardModal').classList.remove('hidden');
    displayLeaderboard(leaderboardData);  // Initial display of leaderboard
  }
  
  // Close the leaderboard modal
  function closeLeaderboard() {
    document.getElementById('leaderboardModal').classList.add('hidden');
  }
  
  // Filter leaderboard based on the number of players
  function filterLeaderboard() {
    const filterValue = document.getElementById('player-filter').value;
    
    let filteredData;
    if (filterValue === 'all') {
      filteredData = leaderboardData;
    } else {
      filteredData = leaderboardData.filter(record => {
        const playerCount = [record.p1Name, record.p2Name, record.p3Name, record.p4Name].filter(name => name).length;
        return playerCount === parseInt(filterValue);
      });
    }
    
    displayLeaderboard(filteredData);
  }
  
  // Display leaderboard data
  function displayLeaderboard(data) {
    const leaderboardBody = document.getElementById('leaderboard-body');
    leaderboardBody.innerHTML = '';  // Clear existing rows
    
    data.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${record.teamName}</td>
        <td><img src="${record.p1Char}" alt="${record.p1Name}"><br>${record.p1Name}</td>
        <td><img src="${record.p2Char || 'default.png'}" alt="${record.p2Name || 'N/A'}"><br>${record.p2Name || 'N/A'}</td>
        <td><img src="${record.p3Char || 'default.png'}" alt="${record.p3Name || 'N/A'}"><br>${record.p3Name || 'N/A'}</td>
        <td><img src="${record.p4Char || 'default.png'}" alt="${record.p4Name || 'N/A'}"><br>${record.p4Name || 'N/A'}</td>
        <td>${record.wavesReached}</td>
      `;
      leaderboardBody.appendChild(row);
    });
  }
  

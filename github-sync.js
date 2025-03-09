const GITHUB = {
  REPO_OWNER: 'reabit',// 需替换为实际用户名
  REPO_NAME: 'Timi',// 新建的存储数据的仓库名
  DATA_PATH: 'data/words.json',// 数据存储路径
  TOKEN: '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',// 从安全存储获取
  MAX_RETRIES: 3,
  RETRY_DELAY: 1500
};

async function saveAllData() {
  let retries = GITHUB.MAX_RETRIES;
  while (retries-- > 0) {
    try {
      const data = {
        words: words,
        stats: stats,
        timestamp: Date.now()
      };

      // 生成Base64编码内容
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      
      // 获取文件SHA（用于更新）
      const sha = await getFileSHA();
      
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB.REPO_OWNER}/${GITHUB.REPO_NAME}/contents/${GITHUB.DATA_PATH}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${GITHUB.TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `自动同步 @ ${new Date().toLocaleString()}`,
            content: content,
            sha: sha
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub API错误: ${errorData.message}`);
      }

      console.log('数据同步成功');
      return true;
    } catch (e) {
      console.error(`同步失败（剩余重试次数 ${retries}）:`, e);
      if (retries === 0) {
        if (navigator.onLine) {
          alert(`同步失败: ${e.message}`);
          // 本地备份
          localStorage.setItem('local_words_backup', JSON.stringify(words));
          localStorage.setItem('local_stats_backup', JSON.stringify(stats));
        }
        return false;
      }
      await new Promise(r => setTimeout(r, GITHUB.RETRY_DELAY));
    }
  }
}

async function loadAllData() {
  try {
    if (!navigator.onLine) {
      const localWords = localStorage.getItem('local_words');
      const localStats = localStorage.getItem('local_stats');
      
      words = localWords ? JSON.parse(localWords) : [];
      stats = localStats ? JSON.parse(localStats) : {
        normal: { total: 0, correct: 0 },
        review: { total: 0, correct: 0 },
        answers: [],
        wrong: [],
        dailyStudy: [0,0,0,0,0,0,0]
      };
      return true;
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB.REPO_OWNER}/${GITHUB.REPO_NAME}/contents/${GITHUB.DATA_PATH}`
    );
    
    if (!response.ok) throw new Error('无法获取仓库数据');
    
    const data = await response.json();
    const decoded = decodeURIComponent(atob(data.content));
    const remoteData = JSON.parse(decoded);

    // 数据合并
    words = [...new Map(
      [...words, ...remoteData.words].map(item => [item.en + '|' + item.cn, item])
    ).values()];
    
    stats = {
      normal: mergeStats(stats.normal, remoteData.stats.normal),
      review: mergeStats(stats.review, remoteData.stats.review),
      answers: [...stats.answers, ...remoteData.stats.answers]
        .filter((v,i,a) => a.findIndex(t => t.wordId === v.wordId) === i),
      wrong: [...stats.wrong, ...remoteData.stats.wrong]
        .filter((v,i,a) => a.findIndex(t => t.en === v.en) === i),
      dailyStudy: stats.dailyStudy.map((v,i) => 
        v + (remoteData.stats.dailyStudy[i] || 0)
      )
    };

    localStorage.setItem('words', JSON.stringify(words));
    localStorage.setItem('stats', JSON.stringify(stats));
    return true;

  } catch (e) {
    console.log('使用本地数据:', e);
    const backupWords = localStorage.getItem('local_words_backup');
    const backupStats = localStorage.getItem('local_stats_backup');
    
    if (backupWords) words = JSON.parse(backupWords);
    if (backupStats) stats = JSON.parse(backupStats);
    return true;
  }
}

function mergeStats(local, remote) {
  return {
    total: local.total + remote.total,
    correct: local.correct + remote.correct
  };
}

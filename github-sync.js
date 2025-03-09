// ============== GitHub 数据同步模块 ==============
const GITHUB = {
  REPO_OWNER: 'reabrit',          // 确保与GitHub用户名一致
  REPO_NAME: 'reabrit.github.io',    // 确保仓库存在且名称正确
  DATA_PATH: 'data/words.json',   // 数据存储路径
  TOKEN: null,                    // 从安全存储获取
  MAX_RETRIES: 5,                 // 增加重试次数
  RETRY_DELAY: 2000               // 延长重试间隔
};


// ============== 增强版数据保存 ==============
async function saveAllData() {
  let retries = GITHUB.MAX_RETRIES;
  
  // 获取访问令牌
  const getToken = async () => {
    if (!GITHUB.TOKEN) {
      GITHUB.TOKEN = localStorage.getItem('github_token') || 
        await new Promise(resolve => {
          const token = prompt('请输入GitHub访问令牌:');
          if (token) {
            localStorage.setItem('github_token', token);
            resolve(token);
          }
          resolve(null);
        });
    }
    return GITHUB.TOKEN;
  };


  while (retries > 0) {
    try {
      const token = await getToken();
      if (!token) throw new Error('需要GitHub访问令牌');


      // 准备数据
      const data = {
        words: words,
        stats: stats,
        timestamp: Date.now(),
        version: '2.0'
      };


      // 获取文件SHA
      const sha = await fetch(
        `https://api.github.com/repos/${GITHUB.REPO_OWNER}/${GITHUB.REPO_NAME}/contents/${GITHUB.DATA_PATH}`,
        { headers: { Authorization: `token ${token}` } }
      )
      .then(res => res.ok ? res.json() : { sha: null })
      .catch(() => ({ sha: null }));


      // 构建请求
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB.REPO_OWNER}/${GITHUB.REPO_NAME}/contents/${GITHUB.DATA_PATH}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `自动同步 @ ${new Date().toLocaleString()}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(data)))),
            sha: sha?.sha || null
          })
        }
      );


      // 处理响应
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`同步失败: ${errorData.message || '未知错误'}`);
      }


      console.log('数据同步成功');
      return true;
    } catch (e) {
      console.error(`同步失败（剩余重试次数 ${retries}）:`, e);
      if (--retries === 0) {
        // 离线保存
        localStorage.setItem('local_words_backup', JSON.stringify(words));
        localStorage.setItem('local_stats_backup', JSON.stringify(stats));
        alert(`最终同步失败: ${e.message}\n数据已保存到本地`);
        return false;
      }
      await new Promise(r => setTimeout(r, GITHUB.RETRY_DELAY));
    }
  }
}


// ============== 增强版数据加载 ==============
async function loadAllData() {
  try {
    const token = localStorage.getItem('github_token');
    if (!token) return false;


    // 从GitHub加载
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB.REPO_OWNER}/${GITHUB.REPO_NAME}/contents/${GITHUB.DATA_PATH}`,
      { headers: { Authorization: `token ${token}` } }
    );


    if (!response.ok) throw new Error('数据加载失败');


    const data = await response.json();
    const decoded = decodeURIComponent(atob(data.content));
    const remoteData = JSON.parse(decoded);


    // 数据合并
    words = [...new Map(
      [...words, ...remoteData.words].map(item => [`${item.en}|${item.cn}`, item])
    ).values()];


    stats = {
      normal: {
        total: (stats.normal?.total || 0) + (remoteData.stats.normal?.total || 0),
        correct: (stats.normal?.correct || 0) + (remoteData.stats.normal?.correct || 0)
      },
      review: {
        total: (stats.review?.total || 0) + (remoteData.stats.review?.total || 0),
        correct: (stats.review?.correct || 0) + (remoteData.stats.review?.correct || 0)
      },
      answers: [...(stats.answers || []), ...(remoteData.stats.answers || [])]
        .filter((v,i,a) => a.findIndex(t => t.wordId === v.wordId) === i),
      wrong: [...(stats.wrong || []), ...(remoteData.stats.wrong || [])]
        .filter((v,i,a) => a.findIndex(t => t.en === v.en) === i),
      dailyStudy: Array.from({ length: 7 }, (_,i) => 
        (stats.dailyStudy?.[i] || 0) + (remoteData.stats.dailyStudy?.[i] || 0))
    };


    localStorage.setItem('words', JSON.stringify(words));
    localStorage.setItem('stats', JSON.stringify(stats));
    return true;


  } catch (e) {
    console.log('使用本地备份数据:', e);
    const backupWords = localStorage.getItem('local_words_backup');
    const backupStats = localStorage.getItem('local_stats_backup');
    
    if (backupWords) words = JSON.parse(backupWords);
    if (backupStats) stats = JSON.parse(backupStats);
    return true;
  }
}    
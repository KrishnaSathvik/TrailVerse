class BatchService {
  constructor() {
    this.queue = [];
    this.batchTimeout = null;
    this.batchDelay = 50; // ms
  }

  addRequest(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.processBatch();
        }, this.batchDelay);
      }
    });
  }

  async processBatch() {
    const batch = [...this.queue];
    this.queue = [];
    this.batchTimeout = null;

    // Group by endpoint
    const grouped = batch.reduce((acc, item) => {
      const key = item.request.url;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    // Process each group
    for (const [url, items] of Object.entries(grouped)) {
      try {
        const ids = items.map(item => item.request.id);
        const response = await fetch(`${url}?ids=${ids.join(',')}`);
        const data = await response.json();

        // Resolve individual promises
        items.forEach((item, index) => {
          item.resolve(data[index]);
        });
      } catch (error) {
        items.forEach(item => item.reject(error));
      }
    }
  }
}

export default new BatchService();

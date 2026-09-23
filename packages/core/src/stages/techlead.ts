import type { Plan, Task } from '../types.js';
import type { TechLeadContract } from './types.js';

export class TechLeadStage {
  /**
   * Generates or extracts the API & Architecture contract based on the plan and tasks.
   * This contract is injected into specialist agent prompts (backend, frontend, mobile, database).
   */
  async generateContract(goal: string, plan: Plan): Promise<TechLeadContract> {
    const endpoints = [];
    const lowerGoal = goal.toLowerCase();

    // Default RESTful inference based on goal keywords if not explicitly specified
    if (lowerGoal.includes('auth') || lowerGoal.includes('đăng nhập') || lowerGoal.includes('user')) {
      endpoints.push({
        method: 'POST',
        path: '/api/v1/auth/login',
        description: 'Xác thực người dùng và trả về JWT access token',
        requestSchema: '{"email": "string", "password": "string"}',
        responseSchema: '{"token": "string", "user": {"id": "string", "email": "string"}}',
      });
      endpoints.push({
        method: 'GET',
        path: '/api/v1/users/me',
        description: 'Lấy thông tin người dùng hiện tại từ Bearer token',
        responseSchema: '{"id": "string", "email": "string", "role": "string"}',
      });
    }

    if (lowerGoal.includes('item') || lowerGoal.includes('sản phẩm') || lowerGoal.includes('task') || lowerGoal.includes('crud')) {
      endpoints.push({
        method: 'GET',
        path: '/api/v1/resources',
        description: 'Danh sách tài nguyên kèm phân trang và lọc',
        responseSchema: '{"items": "any[]", "total": "number", "page": "number"}',
      });
      endpoints.push({
        method: 'POST',
        path: '/api/v1/resources',
        description: 'Tạo mới tài nguyên với validation chặt chẽ',
        requestSchema: '{"title": "string", "data": "any"}',
        responseSchema: '{"id": "string", "createdAt": "string"}',
      });
    }

    const markdownDoc = this.formatAsMarkdown(goal, endpoints);

    return {
      architectureSummary: `Kiến trúc mô-đun hóa đáp ứng mục tiêu: "${goal}". Phân tách rõ tầng Presentation, Business Logic và Data Access.`,
      endpoints,
      databaseSchemaOverview: 'Chuẩn hóa 3NF, audit timestamps (createdAt, updatedAt) và soft-delete nếu cần.',
      sharedRules: [
        'Mọi API response tuân theo format { data?: any, error?: { code: string, message: string } }',
        'Frontend & Mobile phải xử lý đầy đủ các state: loading, error, empty, success',
        'Backend và Database bắt buộc validate payload bằng schema validator (Zod, Joi, hoặc TypeBox)',
        'Mã lỗi HTTP tuân theo chuẩn REST (200, 201, 400, 401, 403, 404, 500)',
        'Backend framework là FASTIFY (không dùng Express). Luôn viết router theo chuẩn Fastify plugin.',
        'Bảo toàn Shared Types: TUYỆT ĐỐI KHÔNG xóa/ghi đè types hiện có trong packages/shared-types/src/index.ts (chỉ export bổ sung).',
      ],
      markdownDocument: markdownDoc,
    };
  }

  /**
   * Enriches task prompts with Tech Lead's API contract so all specialists develop in sync.
   */
  enrichTasksWithContract(tasks: Task[], contract: TechLeadContract): Task[] {
    return tasks.map((task) => {
      const role = task.role.toLowerCase();
      // Inject contract into development roles
      if (['backend', 'frontend', 'mobile', 'database'].includes(role)) {
        const enrichedPrompt = `
[TECH LEAD ARCHITECTURE & API CONTRACT]
${contract.markdownDocument || contract.architectureSummary}

[SHARED RULES]
${contract.sharedRules.map((r) => `- ${r}`).join('\n')}

[YOUR TASK ASSIGNMENT]
${task.prompt}
`.trim();
        return {
          ...task,
          prompt: enrichedPrompt,
        };
      }
      return task;
    });
  }

  private formatAsMarkdown(goal: string, endpoints: TechLeadContract['endpoints']): string {
    let md = `## Tech Lead Architecture & API Contract\n\n**Mục tiêu**: ${goal}\n\n### Danh sách API Endpoints:\n`;
    if (endpoints.length === 0) {
      md += `*Tự động suy luận theo cấu trúc chức năng nội bộ của dự án.*\n`;
    } else {
      md += `| Phương thức | Đường dẫn | Mô tả |\n| :--- | :--- | :--- |\n`;
      for (const ep of endpoints) {
        md += `| \`${ep.method}\` | \`${ep.path}\` | ${ep.description} |\n`;
      }
    }
    return md;
  }
}

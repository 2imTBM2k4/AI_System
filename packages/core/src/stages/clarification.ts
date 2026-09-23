import type { ClarificationQuestion, ClarificationResult } from './types.js';

export class ClarificationStage {
  /**
   * Evaluates if the goal needs clarification before PM creates the plan.
   * If the goal is very brief or has ambiguities, generates targeted questions.
   */
  async evaluate(goal: string): Promise<ClarificationResult> {
    const trimmed = goal.trim();

    // If goal has fewer than 15 characters or is very generic
    if (trimmed.length < 15) {
      return {
        isClear: false,
        summary: 'Yêu cầu còn quá ngắn gọn, cần làm rõ phạm vi trước khi lập kế hoạch.',
        questions: [
          {
            id: 'clarify_scope',
            question: 'Bạn có thể mô tả chi tiết hơn về tính năng hoặc mục tiêu chính cần đạt được?',
            reason: 'Yêu cầu quá ngắn khiến AI không thể xác định chính xác các tác vụ cần phân công.',
          },
          {
            id: 'clarify_tech',
            question: 'Dự án ưu tiên công nghệ, framework hoặc thư viện cụ thể nào không?',
            reason: 'Giúp Tech Lead và các Specialist chọn đúng cấu trúc mã nguồn.',
          },
        ],
      };
    }

    // Check for common ambiguous keywords without context
    const questions: ClarificationQuestion[] = [];
    const lower = trimmed.toLowerCase();

    if ((lower.includes('login') || lower.includes('auth') || lower.includes('đăng nhập')) &&
        !lower.includes('jwt') && !lower.includes('oauth') && !lower.includes('session') && !lower.includes('token')) {
      questions.push({
        id: 'clarify_auth_method',
        question: 'Bạn muốn cơ chế xác thực nào (JWT Bearer Token, OAuth Google/GitHub, hay Session-based)?',
        reason: 'Backend Dev và Tech Lead cần xác định kiến trúc Authentication và Entity User.',
      });
    }

    if ((lower.includes('crud') || lower.includes('quản lý') || lower.includes('danh sách')) &&
        !lower.includes('database') && !lower.includes('db') && !lower.includes('prisma') && !lower.includes('sqlite') && !lower.includes('postgres')) {
      questions.push({
        id: 'clarify_db_storage',
        question: 'Dữ liệu này lưu trữ vào database nào (PostgreSQL, SQLite, MySQL hay In-memory/File)?',
        reason: 'Database Engineer cần viết đúng migration script và schema constraint.',
      });
    }

    if (questions.length > 0) {
      return {
        isClear: false,
        summary: `Hệ thống phát hiện ${questions.length} điểm cần làm rõ để lập kế hoạch tối ưu.`,
        questions,
      };
    }

    return {
      isClear: true,
      questions: [],
      summary: 'Yêu cầu đã đầy đủ thông tin để Project Manager tiến hành phân rã tác vụ.',
    };
  }
}

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS AgentConversations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(80) NOT NULL DEFAULT '训练计划对话',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_AgentConversations_owner (id, user_id),
  KEY IX_AgentConversations_user_recent (user_id, updated_at, id),
  CONSTRAINT FK_AgentConversations_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AgentMessages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  client_message_id CHAR(36) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content VARCHAR(1000) NOT NULL,
  cards_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_AgentMessages_turn_role (conversation_id, client_message_id, role),
  UNIQUE KEY UQ_AgentMessages_conversation (id, conversation_id),
  KEY IX_AgentMessages_conversation_order (conversation_id, id),
  CONSTRAINT FK_AgentMessages_conversation FOREIGN KEY (conversation_id) REFERENCES AgentConversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS AgentActions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  assistant_message_id INT NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('proposed', 'applied', 'rejected', 'expired', 'failed') NOT NULL DEFAULT 'proposed',
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) DEFAULT NULL,
  result_plan_id INT DEFAULT NULL,
  failure_code VARCHAR(60) DEFAULT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_AgentActions_message (assistant_message_id),
  KEY IX_AgentActions_user_status (user_id, status),
  CONSTRAINT FK_AgentActions_conversation_owner FOREIGN KEY (conversation_id, user_id)
    REFERENCES AgentConversations(id, user_id) ON DELETE CASCADE,
  CONSTRAINT FK_AgentActions_message FOREIGN KEY (assistant_message_id, conversation_id)
    REFERENCES AgentMessages(id, conversation_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

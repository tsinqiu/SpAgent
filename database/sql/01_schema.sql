-- SpAgent Phase 0, fresh database schema only.
-- MotionCare 673887bedb63460bbf966a703558ee1d5ac55e77
-- Derived from migrations 01, 05, 06, 07, 14, 15, 16, 17, 18 and 19.
-- Use npm run db:init with a new, empty database.

CREATE TABLE `ExploreArticles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `type` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `summary` varchar(500) DEFAULT NULL,
  `cover_url` varchar(1000) DEFAULT NULL,
  `video_path` varchar(1000) DEFAULT NULL,
  `video_original_name` varchar(260) DEFAULT NULL,
  `video_mime_type` varchar(120) DEFAULT NULL,
  `video_size_bytes` bigint DEFAULT NULL,
  `tags_json` json DEFAULT NULL,
  `difficulty` varchar(40) DEFAULT NULL,
  `duration_min` int DEFAULT NULL,
  `content` mediumtext,
  `status` varchar(40) NOT NULL DEFAULT 'draft',
  `published_at` datetime(3) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_ExploreArticles_type_status_time` (`type`,`status`,`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `Users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(80) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','user') NOT NULL DEFAULT 'user',
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `bio` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_Users_email` (`email`),
  UNIQUE KEY `UQ_Users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `AiCoachFeedback` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `suggestion_date` date DEFAULT NULL,
  `suggestion_type` varchar(40) NOT NULL,
  `model_version` varchar(80) DEFAULT NULL,
  `feedback` varchar(40) NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `ml_provider` varchar(40) DEFAULT NULL,
  `ml_risk_level` varchar(20) DEFAULT NULL,
  `ml_load_action` varchar(20) DEFAULT NULL,
  `ml_weather_risk` varchar(20) DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_AiCoachFeedback_user_date` (`user_id`,`suggestion_date`),
  KEY `IX_AiCoachFeedback_feedback` (`feedback`),
  CONSTRAINT `FK_AiCoachFeedback_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `BodyWeights` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `measurement_date` date NOT NULL,
  `weight_kg` double DEFAULT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'manual',
  `note` varchar(255) DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_BodyWeights_user_date` (`user_id`,`measurement_date`),
  CONSTRAINT `FK_BodyWeights_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `CyclingFtpSnapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `snapshot_date` date NOT NULL,
  `ftp_w` int DEFAULT NULL,
  `sport` varchar(40) DEFAULT NULL,
  `source` varchar(80) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_CyclingFtpSnapshots_user_date` (`user_id`,`snapshot_date`),
  CONSTRAINT `FK_CyclingFtpSnapshots_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `DailyHealthSummaries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `summary_date` date NOT NULL,
  `steps` int DEFAULT NULL,
  `distance_m` double DEFAULT NULL,
  `calories` double DEFAULT NULL,
  `active_calories` double DEFAULT NULL,
  `floors_climbed` double DEFAULT NULL,
  `moderate_intensity_minutes` int DEFAULT NULL,
  `vigorous_intensity_minutes` int DEFAULT NULL,
  `avg_stress_level` double DEFAULT NULL,
  `max_stress_level` double DEFAULT NULL,
  `body_battery_charged` int DEFAULT NULL,
  `body_battery_drained` int DEFAULT NULL,
  `min_body_battery` int DEFAULT NULL,
  `max_body_battery` int DEFAULT NULL,
  `resting_heart_rate_bpm` int DEFAULT NULL,
  `avg_waking_respiration_value` double DEFAULT NULL,
  `lowest_respiration_value` double DEFAULT NULL,
  `highest_respiration_value` double DEFAULT NULL,
  `stress_duration_s` int DEFAULT NULL,
  `rest_stress_duration_s` int DEFAULT NULL,
  `activity_stress_duration_s` int DEFAULT NULL,
  `low_stress_duration_s` int DEFAULT NULL,
  `medium_stress_duration_s` int DEFAULT NULL,
  `high_stress_duration_s` int DEFAULT NULL,
  `sleeping_seconds` int DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_DailyHealthSummaries_user_date` (`user_id`,`summary_date`),
  KEY `IX_DailyHealthSummaries_user_date` (`user_id`,`summary_date`),
  CONSTRAINT `FK_DailyHealthSummaries_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `HeartRateSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sample_time_utc` datetime(3) NOT NULL,
  `heart_rate_bpm` int DEFAULT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'monitoring',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_HeartRateSamples_user_time_source` (`user_id`,`sample_time_utc`,`source`),
  KEY `IX_HeartRateSamples_user_time` (`user_id`,`sample_time_utc`),
  CONSTRAINT `FK_HeartRateSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `HrvSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sample_time_utc` datetime(3) NOT NULL,
  `sleep_date` date DEFAULT NULL,
  `hrv` double DEFAULT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'sleep',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_HrvSamples_user_time_source` (`user_id`,`sample_time_utc`,`source`),
  KEY `IX_HrvSamples_user_date` (`user_id`,`sleep_date`),
  CONSTRAINT `FK_HrvSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `IntensityMinuteSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sample_time_utc` datetime(3) NOT NULL,
  `moderate_minutes` double DEFAULT NULL,
  `vigorous_minutes` double DEFAULT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'garmin',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_IntensityMinuteSamples_user_time` (`user_id`,`sample_time_utc`),
  KEY `IX_IntensityMinuteSamples_user_time` (`user_id`,`sample_time_utc`),
  CONSTRAINT `FK_IntensityMinuteSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `LactateThresholds` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `threshold_date` date NOT NULL,
  `heart_rate_bpm` int DEFAULT NULL,
  `cycling_heart_rate_bpm` int DEFAULT NULL,
  `speed_mps` double DEFAULT NULL,
  `power_w` int DEFAULT NULL,
  `power_to_weight` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_LactateThresholds_user_date` (`user_id`,`threshold_date`),
  CONSTRAINT `FK_LactateThresholds_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `LoginAttempts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(255) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `failure_reason` varchar(120) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_LoginAttempts_email_ip_time` (`email`,`ip_address`,`created_at`),
  KEY `IX_LoginAttempts_ip_time` (`ip_address`,`created_at`),
  KEY `FK_LoginAttempts_user` (`user_id`),
  CONSTRAINT `FK_LoginAttempts_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `MorningReadinessFeedback` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `feedback_date` date NOT NULL,
  `readiness_score` tinyint NOT NULL,
  `muscle_soreness` varchar(20) NOT NULL,
  `mental_state` varchar(20) NOT NULL,
  `training_willingness` varchar(20) NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_MorningReadinessFeedback_user_date` (`user_id`,`feedback_date`),
  KEY `IX_MorningReadinessFeedback_user_date` (`user_id`,`feedback_date`),
  CONSTRAINT `FK_MorningReadinessFeedback_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `RacePredictions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `prediction_date` date NOT NULL,
  `time_5k_s` int DEFAULT NULL,
  `time_10k_s` int DEFAULT NULL,
  `time_half_marathon_s` int DEFAULT NULL,
  `time_marathon_s` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_RacePredictions_user_date` (`user_id`,`prediction_date`),
  CONSTRAINT `FK_RacePredictions_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SecurityEvents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `event_type` varchar(80) NOT NULL,
  `result` varchar(40) NOT NULL DEFAULT 'success',
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `resource_type` varchar(80) DEFAULT NULL,
  `resource_id` varchar(80) DEFAULT NULL,
  `detail_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_SecurityEvents_user_time` (`user_id`,`created_at`),
  KEY `IX_SecurityEvents_type_time` (`event_type`,`created_at`),
  KEY `IX_SecurityEvents_ip_time` (`ip_address`,`created_at`),
  CONSTRAINT `FK_SecurityEvents_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `Shoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `brand` varchar(80) DEFAULT NULL,
  `model` varchar(120) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `distance_km` double NOT NULL DEFAULT '0',
  `is_retired` tinyint(1) NOT NULL DEFAULT '0',
  `photo_path` varchar(1000) DEFAULT NULL,
  `photo_original_name` varchar(260) DEFAULT NULL,
  `photo_mime_type` varchar(120) DEFAULT NULL,
  `photo_size_bytes` bigint DEFAULT NULL,
  `target_distance_km` double DEFAULT NULL,
  `initial_distance_km` double NOT NULL DEFAULT '0',
  `price` double DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `FK_Shoes_user` (`user_id`),
  CONSTRAINT `FK_Shoes_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SleepMovementSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sleep_date` date NOT NULL,
  `segment_start_utc` datetime(3) NOT NULL,
  `segment_end_utc` datetime(3) DEFAULT NULL,
  `movement_level` int DEFAULT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'sleepMovement',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_SleepMovementSamples_user_start_source` (`user_id`,`segment_start_utc`,`source`),
  KEY `IX_SleepMovementSamples_user_date` (`user_id`,`sleep_date`),
  CONSTRAINT `FK_SleepMovementSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SleepStageSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sleep_date` date NOT NULL,
  `stage_start_utc` datetime(3) NOT NULL,
  `stage_end_utc` datetime(3) NOT NULL,
  `stage_type` varchar(40) NOT NULL,
  `duration_s` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_SleepStageSamples_user_start` (`user_id`,`stage_start_utc`),
  KEY `IX_SleepStageSamples_user_date` (`user_id`,`sleep_date`),
  CONSTRAINT `FK_SleepStageSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SleepSummaries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sleep_date` date NOT NULL,
  `sleep_start` datetime(3) DEFAULT NULL,
  `sleep_end` datetime(3) DEFAULT NULL,
  `duration_s` int DEFAULT NULL,
  `deep_sleep_s` int DEFAULT NULL,
  `light_sleep_s` int DEFAULT NULL,
  `rem_sleep_s` int DEFAULT NULL,
  `awake_s` int DEFAULT NULL,
  `sleep_score` int DEFAULT NULL,
  `avg_hrv` double DEFAULT NULL,
  `hrv_status` varchar(40) DEFAULT NULL,
  `avg_heart_rate_during_sleep` int DEFAULT NULL,
  `avg_sleep_stress` double DEFAULT NULL,
  `avg_respiration_value` double DEFAULT NULL,
  `lowest_respiration_value` double DEFAULT NULL,
  `highest_respiration_value` double DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_SleepSummaries_user_date` (`user_id`,`sleep_date`),
  KEY `IX_SleepSummaries_user_date` (`user_id`,`sleep_date`),
  CONSTRAINT `FK_SleepSummaries_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `StepSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `segment_start_utc` datetime(3) NOT NULL,
  `segment_end_utc` datetime(3) DEFAULT NULL,
  `steps` int NOT NULL DEFAULT '0',
  `activity_level` varchar(80) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_StepSamples_user_start` (`user_id`,`segment_start_utc`),
  KEY `IX_StepSamples_user_time` (`user_id`,`segment_start_utc`),
  CONSTRAINT `FK_StepSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `StressSamples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `sample_time_utc` datetime(3) NOT NULL,
  `stress_level` int DEFAULT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'monitoring',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_StressSamples_user_time_source` (`user_id`,`sample_time_utc`,`source`),
  KEY `IX_StressSamples_user_time` (`user_id`,`sample_time_utc`),
  CONSTRAINT `FK_StressSamples_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SyncJobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` varchar(40) NOT NULL,
  `job_type` varchar(40) NOT NULL DEFAULT 'manual_sync',
  `status` varchar(40) NOT NULL DEFAULT 'queued',
  `requested_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `started_at` datetime(3) DEFAULT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `activity_count` int NOT NULL DEFAULT '0',
  `error_message` varchar(1000) DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IX_SyncJobs_user_provider_time` (`user_id`,`provider`,`requested_at`),
  CONSTRAINT `FK_SyncJobs_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SyncProviderConnections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` varchar(40) NOT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'not_connected',
  `auto_sync` tinyint(1) NOT NULL DEFAULT '0',
  `sync_direction` varchar(20) NOT NULL DEFAULT 'import',
  `last_sync_at` datetime(3) DEFAULT NULL,
  `connected_at` datetime(3) DEFAULT NULL,
  `disconnected_at` datetime(3) DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_SyncProviderConnections_user_provider` (`user_id`,`provider`),
  CONSTRAINT `FK_SyncProviderConnections_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `TrainingStatusSnapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `snapshot_date` date NOT NULL,
  `vo2max` double DEFAULT NULL,
  `training_status` varchar(80) DEFAULT NULL,
  `load_balance` varchar(80) DEFAULT NULL,
  `acute_training_load` double DEFAULT NULL,
  `chronic_training_load` double DEFAULT NULL,
  `acute_chronic_workload_ratio` double DEFAULT NULL,
  `acwr_status` varchar(80) DEFAULT NULL,
  `acwr_percent` double DEFAULT NULL,
  `optimal_load_min` double DEFAULT NULL,
  `optimal_load_max` double DEFAULT NULL,
  `low_aerobic_load` double DEFAULT NULL,
  `low_aerobic_target_min` double DEFAULT NULL,
  `low_aerobic_target_max` double DEFAULT NULL,
  `high_aerobic_load` double DEFAULT NULL,
  `high_aerobic_target_min` double DEFAULT NULL,
  `high_aerobic_target_max` double DEFAULT NULL,
  `anaerobic_load` double DEFAULT NULL,
  `anaerobic_target_min` double DEFAULT NULL,
  `anaerobic_target_max` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_TrainingStatusSnapshots_user_date` (`user_id`,`snapshot_date`),
  CONSTRAINT `FK_TrainingStatusSnapshots_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `UserFollows` (
  `follower_user_id` int NOT NULL,
  `following_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`follower_user_id`,`following_user_id`),
  KEY `IX_UserFollows_following` (`following_user_id`,`created_at`),
  CONSTRAINT `FK_UserFollows_follower` FOREIGN KEY (`follower_user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_UserFollows_following` FOREIGN KEY (`following_user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `UserSettings` (
  `user_id` int NOT NULL,
  `distance_unit` varchar(20) NOT NULL DEFAULT 'km',
  `weight_unit` varchar(20) NOT NULL DEFAULT 'kg',
  `temperature_unit` varchar(20) NOT NULL DEFAULT 'c',
  `pace_unit` varchar(30) NOT NULL DEFAULT 'min_per_km',
  `default_privacy` varchar(30) NOT NULL DEFAULT 'private',
  `hide_map_endpoints` tinyint(1) NOT NULL DEFAULT '1',
  `health_sync` tinyint(1) NOT NULL DEFAULT '0',
  `sync_preferences_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `FK_UserSettings_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `Activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_key` varchar(120) NOT NULL,
  `garmin_activity_id` varchar(80) DEFAULT NULL,
  `activity_name` varchar(200) DEFAULT NULL,
  `activity_type` varchar(80) DEFAULT NULL,
  `sport_code` int DEFAULT NULL,
  `sub_sport_code` int DEFAULT NULL,
  `start_time_utc` datetime(3) DEFAULT NULL,
  `local_start_time` datetime(3) DEFAULT NULL,
  `location_name` varchar(200) DEFAULT NULL,
  `start_latitude` double DEFAULT NULL,
  `start_longitude` double DEFAULT NULL,
  `end_latitude` double DEFAULT NULL,
  `end_longitude` double DEFAULT NULL,
  `owner_user_id` int DEFAULT NULL,
  `data_source` varchar(40) NOT NULL DEFAULT 'garmin_import',
  `is_manual` tinyint(1) NOT NULL DEFAULT '0',
  `match_status` varchar(40) NOT NULL DEFAULT 'imported',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `shoe_id` int DEFAULT NULL,
  `perceived_effort` tinyint DEFAULT NULL,
  `photo_path` varchar(1000) DEFAULT NULL,
  `photo_original_name` varchar(260) DEFAULT NULL,
  `photo_mime_type` varchar(120) DEFAULT NULL,
  `photo_size_bytes` bigint DEFAULT NULL,
  `weather_condition` varchar(80) DEFAULT NULL,
  `temperature_c` double DEFAULT NULL,
  `humidity_percent` tinyint DEFAULT NULL,
  `feels_like_c` double DEFAULT NULL,
  `weather_source` varchar(40) DEFAULT NULL,
  `weather_updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_Activities_activity_key` (`activity_key`),
  UNIQUE KEY `UQ_Activities_garmin_activity_id` (`garmin_activity_id`),
  KEY `FK_Activities_shoe` (`shoe_id`),
  KEY `IX_Activities_type_start` (`activity_type`,`start_time_utc`),
  KEY `IX_Activities_local_start` (`local_start_time`),
  KEY `IX_Activities_owner_source` (`owner_user_id`,`data_source`),
  KEY `IX_Activities_source_start` (`data_source`,`local_start_time`),
  KEY `IX_Activities_owner_start` (`owner_user_id`,`local_start_time`),
  CONSTRAINT `FK_Activities_owner_user` FOREIGN KEY (`owner_user_id`) REFERENCES `Users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_Activities_shoe` FOREIGN KEY (`shoe_id`) REFERENCES `Shoes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `SyncLogs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `job_id` bigint DEFAULT NULL,
  `user_id` int NOT NULL,
  `provider` varchar(40) NOT NULL,
  `level` varchar(20) NOT NULL DEFAULT 'info',
  `message` varchar(1000) NOT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_SyncLogs_user_time` (`user_id`,`created_at`),
  KEY `FK_SyncLogs_job` (`job_id`),
  CONSTRAINT `FK_SyncLogs_job` FOREIGN KEY (`job_id`) REFERENCES `SyncJobs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_SyncLogs_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `ActivitySummaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_id` int NOT NULL,
  `duration_s` double DEFAULT NULL,
  `moving_duration_s` double DEFAULT NULL,
  `elapsed_duration_s` double DEFAULT NULL,
  `distance_m` double DEFAULT NULL,
  `calories` double DEFAULT NULL,
  `avg_speed_mps` double DEFAULT NULL,
  `max_speed_mps` double DEFAULT NULL,
  `avg_heart_rate_bpm` int DEFAULT NULL,
  `max_heart_rate_bpm` int DEFAULT NULL,
  `avg_cadence_spm` double DEFAULT NULL,
  `max_cadence_spm` double DEFAULT NULL,
  `avg_power_w` int DEFAULT NULL,
  `max_power_w` int DEFAULT NULL,
  `normalized_power_w` int DEFAULT NULL,
  `aerobic_training_effect` double DEFAULT NULL,
  `anaerobic_training_effect` double DEFAULT NULL,
  `aerobic_training_effect_message` varchar(160) DEFAULT NULL,
  `anaerobic_training_effect_message` varchar(160) DEFAULT NULL,
  `training_effect_label` varchar(120) DEFAULT NULL,
  `activity_training_load` double DEFAULT NULL,
  `vo2max` double DEFAULT NULL,
  `body_battery_delta` int DEFAULT NULL,
  `avg_stride_length_cm` double DEFAULT NULL,
  `elevation_gain_m` double DEFAULT NULL,
  `elevation_loss_m` double DEFAULT NULL,
  `min_elevation_m` double DEFAULT NULL,
  `max_elevation_m` double DEFAULT NULL,
  `manufacturer` varchar(100) DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_ActivitySummaries_activity` (`activity_id`),
  KEY `IX_ActivitySummaries_load` (`activity_training_load`),
  KEY `IX_ActivitySummaries_distance` (`distance_m`),
  KEY `IX_ActivitySummaries_duration` (`duration_s`),
  KEY `IX_ActivitySummaries_avg_hr` (`avg_heart_rate_bpm`),
  KEY `IX_ActivitySummaries_max_hr` (`max_heart_rate_bpm`),
  KEY `IX_ActivitySummaries_avg_speed` (`avg_speed_mps`),
  CONSTRAINT `FK_ActivitySummaries_Activities` FOREIGN KEY (`activity_id`) REFERENCES `Activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `ActivityZones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_id` int NOT NULL,
  `zone_type` varchar(40) NOT NULL,
  `zone_index` int NOT NULL,
  `duration_s` double NOT NULL,
  `source_field` varchar(80) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_ActivityZones_activity_type_index` (`activity_id`,`zone_type`,`zone_index`),
  KEY `IX_ActivityZones_activity_type` (`activity_id`,`zone_type`),
  CONSTRAINT `FK_ActivityZones_Activities` FOREIGN KEY (`activity_id`) REFERENCES `Activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `CommunityPosts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `activity_id` int DEFAULT NULL,
  `content` text NOT NULL,
  `visibility` varchar(30) NOT NULL DEFAULT 'public',
  `image_path` varchar(1000) DEFAULT NULL,
  `image_original_name` varchar(260) DEFAULT NULL,
  `image_mime_type` varchar(120) DEFAULT NULL,
  `image_size_bytes` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_CommunityPosts_visibility_time` (`visibility`,`created_at`),
  KEY `FK_CommunityPosts_user` (`user_id`),
  KEY `FK_CommunityPosts_activity` (`activity_id`),
  CONSTRAINT `FK_CommunityPosts_activity` FOREIGN KEY (`activity_id`) REFERENCES `Activities` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_CommunityPosts_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `Laps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_id` int NOT NULL,
  `lap_index` int NOT NULL,
  `start_time_utc` datetime(3) DEFAULT NULL,
  `total_elapsed_time_s` double DEFAULT NULL,
  `total_timer_time_s` double DEFAULT NULL,
  `total_distance_m` double DEFAULT NULL,
  `avg_speed_mps` double DEFAULT NULL,
  `max_speed_mps` double DEFAULT NULL,
  `avg_heart_rate_bpm` int DEFAULT NULL,
  `max_heart_rate_bpm` int DEFAULT NULL,
  `avg_cadence` double DEFAULT NULL,
  `max_cadence` double DEFAULT NULL,
  `avg_power_w` int DEFAULT NULL,
  `max_power_w` int DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IX_Laps_activity_index` (`activity_id`,`lap_index`),
  CONSTRAINT `FK_Laps_Activities` FOREIGN KEY (`activity_id`) REFERENCES `Activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `TrackPoints` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activity_id` int NOT NULL,
  `sample_index` int NOT NULL,
  `sample_time_utc` datetime(3) DEFAULT NULL,
  `latitude` double DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  `altitude_m` double DEFAULT NULL,
  `distance_m` double DEFAULT NULL,
  `speed_mps` double DEFAULT NULL,
  `accuracy_m` double DEFAULT NULL,
  `bearing_deg` double DEFAULT NULL,
  `provider` varchar(40) DEFAULT NULL,
  `is_accepted` tinyint(1) DEFAULT NULL,
  `reject_reason` varchar(80) DEFAULT NULL,
  `heart_rate_bpm` int DEFAULT NULL,
  `cadence` double DEFAULT NULL,
  `power_w` int DEFAULT NULL,
  `accumulated_power_w` int DEFAULT NULL,
  `vertical_oscillation_mm` double DEFAULT NULL,
  `stance_time_ms` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IX_TrackPoints_activity_index` (`activity_id`,`sample_index`),
  KEY `IX_TrackPoints_activity_time` (`activity_id`,`sample_time_utc`),
  KEY `IX_TrackPoints_activity_distance` (`activity_id`,`distance_m`),
  CONSTRAINT `FK_TrackPoints_Activities` FOREIGN KEY (`activity_id`) REFERENCES `Activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `WorkoutSessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `activity_type` varchar(80) NOT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'active',
  `started_at` datetime(3) NOT NULL,
  `paused_at` datetime(3) DEFAULT NULL,
  `paused_duration_s` int NOT NULL DEFAULT '0',
  `finished_at` datetime(3) DEFAULT NULL,
  `activity_id` int DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_WorkoutSessions_user_status` (`user_id`,`status`,`started_at`),
  KEY `FK_WorkoutSessions_activity` (`activity_id`),
  CONSTRAINT `FK_WorkoutSessions_activity` FOREIGN KEY (`activity_id`) REFERENCES `Activities` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_WorkoutSessions_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `CommunityComments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `post_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `content` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_CommunityComments_post_time` (`post_id`,`created_at`),
  KEY `FK_CommunityComments_user` (`user_id`),
  CONSTRAINT `FK_CommunityComments_post` FOREIGN KEY (`post_id`) REFERENCES `CommunityPosts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_CommunityComments_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `CommunityLikes` (
  `post_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`user_id`),
  KEY `FK_CommunityLikes_user` (`user_id`),
  CONSTRAINT `FK_CommunityLikes_post` FOREIGN KEY (`post_id`) REFERENCES `CommunityPosts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_CommunityLikes_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `CommunityShares` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `post_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `channel` varchar(40) NOT NULL DEFAULT 'copy_link',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IX_CommunityShares_post` (`post_id`),
  KEY `FK_CommunityShares_user` (`user_id`),
  CONSTRAINT `FK_CommunityShares_post` FOREIGN KEY (`post_id`) REFERENCES `CommunityPosts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_CommunityShares_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `WorkoutTrackPoints` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `workout_session_id` bigint NOT NULL,
  `sample_index` int NOT NULL,
  `sample_time_utc` datetime(3) NOT NULL,
  `latitude` double DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  `altitude_m` double DEFAULT NULL,
  `distance_m` double DEFAULT NULL,
  `speed_mps` double DEFAULT NULL,
  `accuracy_m` double DEFAULT NULL,
  `bearing_deg` double DEFAULT NULL,
  `provider` varchar(40) DEFAULT NULL,
  `is_accepted` tinyint(1) DEFAULT NULL,
  `reject_reason` varchar(80) DEFAULT NULL,
  `heart_rate_bpm` int DEFAULT NULL,
  `cadence` double DEFAULT NULL,
  `power_w` int DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_WorkoutTrackPoints_session_index` (`workout_session_id`,`sample_index`),
  KEY `IX_WorkoutTrackPoints_session_time` (`workout_session_id`,`sample_time_utc`),
  CONSTRAINT `FK_WorkoutTrackPoints_session` FOREIGN KEY (`workout_session_id`) REFERENCES `WorkoutSessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

pipeline {
    agent any

    tools {
        nodejs 'Node24'
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 10, unit: 'MINUTES')
    }

    stages {
        stage('Verificar herramientas') {
            steps {
                sh 'node --version'
                sh 'npm --version'
            }
        }

        stage('Instalar dependencias') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Revisar sintaxis') {
            steps {
                sh 'node --check app.js'
                sh 'node --check database.js'
                sh 'node --check tickets.js'
                sh 'node --check personal.js'
            }
        }

        stage('Ejecutar pruebas funcionales') {
            steps {
                sh 'npm run test:ci'
            }
            post {
                always {
                    junit testResults: 'reports/junit.xml', allowEmptyResults: false
                    archiveArtifacts artifacts: 'reports/junit.xml', allowEmptyArchive: false
                }
            }
        }
    }
}
